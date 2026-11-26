import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { ManeuverIcon } from '../ManeuverIcon';
import { PlaceInput } from '../PlaceInput';
import { formatDistance, formatDuration, type RouteData } from '../routeNav';
import type { useWaypoints } from '../useWaypoints';
import { MAP_PANEL } from '../mapUi';

export type DepartState = { mode: 'now' | 'later'; local: string };

interface DirectionsPanelProps {
  wp: ReturnType<typeof useWaypoints>;
  travelMode: 'driving' | 'walking';
  onTravelMode: (m: 'driving' | 'walking') => void;
  routes: RouteData[];
  selected: number;
  onSelect: (i: number) => void;
  calculating: boolean;
  routeError: string;
  retryable: boolean;
  onRetry: () => void;
  avoid: { tolls: boolean; highways: boolean; ferries: boolean };
  onAvoid: (a: { tolls: boolean; highways: boolean; ferries: boolean }) => void;
  depart: DepartState;
  onDepart: (d: DepartState) => void;
  /** The planned departure is in the past, so "now" is used instead. */
  departPast: boolean;
  canStart: boolean;
  startHint: string;
  onStart: () => void;
  onShare: () => void;
  onBack: () => void;
  trip?: { patientName: string; patientPhone: string; driverName: string };
  /** Extra content for the driver's trip (leg, status, actions), shown above the waypoints. */
  tripSlot?: React.ReactNode;
}

const nowLocalMin = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

/** The directions card: waypoints, travel mode, departure, route options, steps, start. */
export function DirectionsPanel(p: DirectionsPanelProps) {
  const { wp } = p;
  const [minimized, setMinimized] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const route = p.routes[p.selected] ?? null;
  const fastest = p.routes.reduce((best, r, i) => (r.duration < (p.routes[best]?.duration ?? Infinity) ? i : best), 0);
  const optionsActive = p.avoid.tolls || p.avoid.highways || p.avoid.ferries || p.depart.mode === 'later';
  const summary = route ? `${formatDuration(route.duration)} (${formatDistance(route.distance)})` : '';

  return (
    <div className={`${MAP_PANEL} p-4 transition-all`} data-testid="directions-panel">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={p.onBack}
            title="رجوع إلى البحث"
            aria-label="رجوع إلى البحث"
            data-testid="back-to-search"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface2 text-muted transition hover:text-fg"
          >
            <Icon name="arrow" className="h-4 w-4 rtl:-scale-x-100" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-fg">الاتجاهات</h2>
            <p className="truncate text-xs text-muted">مسار النقل والملاحة</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex rounded-full bg-surface2 p-0.5 text-xs">
            {(['driving', 'walking'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => p.onTravelMode(m)}
                title={m === 'driving' ? 'سيارة' : 'مشي'}
                className={`grid h-8 w-9 place-items-center rounded-full text-xs transition ${p.travelMode === m ? 'bg-brand-600 text-white shadow-md' : 'text-muted hover:text-fg'}`}
              >
                <Icon name={m === 'driving' ? 'car' : 'walk'} className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? 'توسيع البطاقة' : 'تصغير لمشاهدة الخريطة بالكامل'}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-muted transition hover:text-fg"
          >
            <Icon name={minimized ? 'down' : 'up'} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {minimized ? (
        <div className="flex items-center justify-between gap-2 pt-3 text-sm">
          <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
            <span className="truncate font-medium text-fg">{wp.from.label || 'الانطلاق'}</span>
            <Icon name="arrow" className="h-4 w-4 rtl:-scale-x-100" />
            <span className="truncate font-medium text-fg">{wp.to.label || 'الوجهة'}</span>
            {route && <span className="shrink-0 font-mono font-semibold text-brand-600 dark:text-brand-300">({formatDuration(route.duration)})</span>}
          </div>
          <button
            type="button"
            disabled={!p.canStart}
            onClick={p.onStart}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-xs font-medium text-white shadow-md transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Icon name="compass" />
            <span>انطلق</span>
          </button>
        </div>
      ) : (
        <>
          {p.tripSlot && <div className="mt-3">{p.tripSlot}</div>}

          {/* Waypoints */}
          <div className="relative mt-3 space-y-2">
            <PlaceInput
              value={wp.fromText}
              badge="A"
              badgeClass="bg-emerald-500"
              placeholder="اختر نقطة الانطلاق..."
              unresolved={wp.fromDirty || (!!wp.fromText && !wp.from.coord)}
              onChange={(t) => wp.setText('from', t)}
              onPick={(pl) => wp.setPlace('from', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
              onClear={() => wp.clear('from')}
              onUseCurrentLocation={() => wp.useMyLocation('from')}
            />
            <div className="relative z-10 -my-2.5 flex justify-end pe-4">
              <button
                type="button"
                onClick={wp.swap}
                title="تبديل نقطة الانطلاق والوجهة"
                className="grid h-8 w-8 place-items-center rounded-full bg-surface text-muted shadow-md transition hover:text-fg active:scale-95"
              >
                <Icon name="swap" className="h-4 w-4" />
              </button>
            </div>
            <PlaceInput
              value={wp.toText}
              badge="B"
              badgeClass="bg-red-500"
              placeholder="اختر نقطة الوجهة..."
              unresolved={wp.toDirty || (!!wp.toText && !wp.to.coord)}
              onChange={(t) => wp.setText('to', t)}
              onPick={(pl) => wp.setPlace('to', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
              onClear={() => wp.clear('to')}
            />
            {wp.geoMsg && <p className="ps-1 text-xs text-amber-600">{wp.geoMsg}</p>}
          </div>

          {/* Trip context (from the calendar) */}
          {p.trip?.patientName && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-[var(--tint-sky)] px-3.5 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">رحلة من التقويم</p>
                <p className="truncate text-sm font-medium text-fg">المريض: {p.trip.patientName}</p>
                {p.trip.driverName && <p className="truncate text-xs text-muted">السائق: {p.trip.driverName}</p>}
              </div>
              {p.trip.patientPhone && (
                <a
                  href={`https://wa.me/${p.trip.patientPhone.replace(/[^\d]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-md hover:bg-emerald-700"
                >
                  واتساب
                </a>
              )}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {p.calculating && <div className="animate-pulse py-1 text-center text-sm text-muted">جارٍ حساب المسار الأمثل...</div>}

            {p.routeError && !p.calculating && (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--tint-rose)] px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
                <span>{p.routeError}</span>
                {p.retryable && (
                  <button type="button" onClick={p.onRetry} className="shrink-0 rounded-full bg-red-600 px-3 py-1 font-medium text-white">
                    إعادة المحاولة
                  </button>
                )}
              </div>
            )}

            {/* Route options */}
            {p.routes.length > 0 && !p.calculating && (
              <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:flex-col sm:gap-1.5 sm:overflow-visible sm:pb-0" role="radiogroup" aria-label="خيارات المسار">
                {p.routes.map((r, i) => {
                  const jam = r.traffic.some((t) => t.speed === 'TRAFFIC_JAM');
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={i === p.selected}
                      onClick={() => p.onSelect(i)}
                      data-testid={`route-option-${i}`}
                      className={`flex w-44 shrink-0 snap-start items-center justify-between gap-2 rounded-2xl px-3.5 py-3 text-start transition sm:w-full ${
                        i === p.selected ? 'bg-accent-soft ring-2 ring-brand-500/25' : 'bg-surface2 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-lg font-semibold leading-none ${i === p.selected ? 'text-accent-soft-fg' : 'text-fg'}`}>{formatDuration(r.duration)}</div>
                        <div className="mt-1.5 truncate text-xs text-muted">
                          {formatDistance(r.distance)}
                          {r.summary ? ` • عبر ${r.summary}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {i === fastest && <span className="rounded-full bg-[var(--tint-sage)] px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">الأسرع</span>}
                        {jam && <span className="rounded-full bg-[var(--tint-rose)] px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">ازدحام</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {p.depart.mode === 'later' && p.routes.length > 0 && !p.calculating && !p.departPast && (
              <p className="text-xs text-muted"><Icon name="clock" inline /> الأوقات مقدّرة حسب الازدحام المتوقع وقت المغادرة المحدد.</p>
            )}
            {p.departPast && <p className="text-xs text-amber-600">وقت المغادرة مضى، لذلك حُسب المسار للمغادرة الآن.</p>}

            {/* Steps / options / share share one row (keeps the card short on phones) */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              {route && route.steps.length > 0 && !p.calculating && (
                <button type="button" onClick={() => setShowSteps((v) => !v)} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300" data-testid="steps-toggle">
                  {showSteps ? 'إخفاء الخطوات' : `عرض الخطوات (${route.steps.length})`}
                </button>
              )}
              <div className="ms-auto flex items-center gap-3">
                {route && (
                  <button type="button" onClick={p.onShare} className="text-xs font-medium text-muted transition hover:text-fg" data-testid="share-route">
                    <Icon name="link" inline /> مشاركة
                  </button>
                )}
                <button type="button" onClick={() => setShowOptions((v) => !v)} className="text-xs font-medium text-muted transition hover:text-fg" data-testid="options-toggle">
                  <Icon name="sliders" inline /> الخيارات {optionsActive ? '(مفعّلة)' : ''} <Icon name={showOptions ? 'up' : 'down'} inline className="h-3.5 w-3.5" />
                </button>
              </div>

              {showSteps && route && (
                <ol className="max-h-48 basis-full space-y-1.5 overflow-y-auto pe-1" data-testid="route-steps">
                  {route.steps.map((st, i) => (
                    <li key={i} className="flex items-center gap-2.5 rounded-2xl bg-surface2 px-3 py-2 text-xs">
                      <ManeuverIcon maneuver={st.maneuver} size={18} className="shrink-0 text-brand-600 dark:text-brand-300" />
                      <span className="min-w-0 flex-1 truncate text-fg">{st.instruction}</span>
                      <span className="shrink-0 font-mono text-muted">{formatDistance(st.distance)}</span>
                    </li>
                  ))}
                </ol>
              )}

              {showOptions && (
                <div className="basis-full space-y-3 rounded-2xl bg-surface2 p-3.5 text-xs" data-testid="options-panel">
                  {p.travelMode === 'driving' ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-muted">المغادرة:</span>
                        <select
                          value={p.depart.mode}
                          onChange={(e) => p.onDepart({ ...p.depart, mode: e.target.value as 'now' | 'later', local: p.depart.local || nowLocalMin() })}
                          className="rounded-full bg-surface px-3 py-1.5 text-xs text-fg shadow-sm outline-none"
                          data-testid="depart-mode"
                        >
                          <option value="now">الآن</option>
                          <option value="later">في وقت محدد</option>
                        </select>
                        {p.depart.mode === 'later' && (
                          <input
                            type="datetime-local"
                            min={nowLocalMin()}
                            value={p.depart.local}
                            onChange={(e) => p.onDepart({ ...p.depart, local: e.target.value })}
                            className="rounded-full bg-surface px-3 py-1.5 text-xs text-fg shadow-sm outline-none"
                            dir="ltr"
                            data-testid="depart-time"
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                        {([
                          ['tolls', 'تجنّب الرسوم'],
                          ['highways', 'تجنّب الطرق السريعة'],
                          ['ferries', 'تجنّب العبّارات'],
                        ] as const).map(([k, label]) => (
                          <label key={k} className="flex cursor-pointer items-center gap-1.5 text-fg">
                            <input
                              type="checkbox"
                              checked={p.avoid[k]}
                              onChange={(e) => p.onAvoid({ ...p.avoid, [k]: e.target.checked })}
                              data-testid={`avoid-${k}`}
                              className="h-4 w-4 accent-[var(--ring)]"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted">خيارات المسار متاحة للقيادة فقط.</p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!p.canStart}
              onClick={p.onStart}
              data-testid="start-nav"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-sm font-medium text-white shadow-md transition hover:bg-brand-700 hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <Icon name="compass" />
              <span>{p.canStart ? `ابدأ الملاحة${summary ? ` • ${summary}` : ''}` : p.startHint || 'ابدأ الملاحة'}</span>
            </button>
            {p.canStart && !wp.fromIsGps && (
              <p className="text-center text-xs text-muted" data-testid="start-from-gps-note">
                الملاحة تبدأ من موقعك الفعلي (GPS) باتجاه الوجهة.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
