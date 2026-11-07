import { useState } from 'react';
import { ManeuverIcon } from '../ManeuverIcon';
import { PlaceInput } from '../PlaceInput';
import { formatDistance, formatDuration, type RouteData } from '../routeNav';
import type { useWaypoints } from '../useWaypoints';

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
    <div className="rounded-2xl border border-border bg-surface/95 p-3 text-fg shadow-2xl backdrop-blur-md transition-all sm:p-4" data-testid="directions-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={p.onBack}
            title="رجوع إلى البحث"
            aria-label="رجوع إلى البحث"
            data-testid="back-to-search"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface2 text-xs text-muted hover:text-fg"
          >
            ➜
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-bold text-fg sm:text-sm">الاتجاهات</h2>
            <p className="truncate text-[10px] text-muted sm:text-[11px]">مسار النقل والملاحة</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex rounded-lg bg-surface2 p-0.5 text-xs">
            {(['driving', 'walking'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => p.onTravelMode(m)}
                title={m === 'driving' ? 'سيارة' : 'مشي'}
                className={`rounded-md p-1 text-xs transition sm:p-1.5 ${p.travelMode === m ? 'bg-blue-600 text-white shadow' : 'text-muted hover:text-fg'}`}
              >
                {m === 'driving' ? '🚗' : '🚶'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? 'توسيع البطاقة' : 'تصغير لمشاهدة الخريطة بالكامل'}
            className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface2 text-xs text-muted transition hover:text-fg"
          >
            {minimized ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {minimized ? (
        <div className="flex items-center justify-between gap-2 pt-2 text-xs">
          <div className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted">
            <span className="truncate font-medium text-fg">{wp.from.label || 'الانطلاق'}</span>
            <span>➔</span>
            <span className="truncate font-medium text-fg">{wp.to.label || 'الوجهة'}</span>
            {route && <span className="shrink-0 font-mono font-bold text-blue-600">({formatDuration(route.duration)})</span>}
          </div>
          <button
            type="button"
            disabled={!p.canStart}
            onClick={p.onStart}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            <span>🧭</span>
            <span>انطلق</span>
          </button>
        </div>
      ) : (
        <>
          {/* Waypoints */}
          <div className="relative mt-2.5 space-y-1.5">
            <PlaceInput
              value={wp.fromText}
              badge="A"
              badgeClass="bg-emerald-600"
              placeholder="اختر نقطة الانطلاق..."
              unresolved={wp.fromDirty || (!!wp.fromText && !wp.from.coord)}
              onChange={(t) => wp.setText('from', t)}
              onPick={(pl) => wp.setPlace('from', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
              onClear={() => wp.clear('from')}
              onUseCurrentLocation={() => wp.useMyLocation('from')}
            />
            <div className="relative z-10 -my-1 flex justify-end pe-3">
              <button
                type="button"
                onClick={wp.swap}
                title="تبديل نقطة الانطلاق والوجهة"
                className="grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-xs text-muted shadow-sm transition hover:border-blue-500 hover:text-fg active:scale-95"
              >
                ⇅
              </button>
            </div>
            <PlaceInput
              value={wp.toText}
              badge="B"
              badgeClass="bg-red-600"
              placeholder="اختر نقطة الوجهة..."
              unresolved={wp.toDirty || (!!wp.toText && !wp.to.coord)}
              onChange={(t) => wp.setText('to', t)}
              onPick={(pl) => wp.setPlace('to', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
              onClear={() => wp.clear('to')}
            />
            {wp.geoMsg && <p className="ps-1 text-[11px] text-amber-600">{wp.geoMsg}</p>}
          </div>

          {/* Trip context (from the calendar) */}
          {p.trip?.patientName && (
            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-blue-500">رحلة من التقويم</p>
                <p className="truncate text-xs font-bold text-fg">المريض: {p.trip.patientName}</p>
                {p.trip.driverName && <p className="truncate text-[10px] text-muted">السائق: {p.trip.driverName}</p>}
              </div>
              {p.trip.patientPhone && (
                <a
                  href={`https://wa.me/${p.trip.patientPhone.replace(/[^\d]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-700"
                >
                  واتساب
                </a>
              )}
            </div>
          )}

          <div className="mt-3 space-y-2.5 border-t border-border/80 pt-2.5">
            {p.calculating && <div className="animate-pulse py-1 text-center text-xs text-muted">جارٍ حساب المسار الأمثل...</div>}

            {p.routeError && !p.calculating && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-red-500/10 px-2.5 py-2 text-xs text-red-600">
                <span>{p.routeError}</span>
                {p.retryable && (
                  <button type="button" onClick={p.onRetry} className="shrink-0 rounded-lg bg-red-600 px-2 py-1 font-bold text-white">
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
                      className={`flex w-40 shrink-0 snap-start items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-start transition sm:w-full ${
                        i === p.selected ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-surface2 hover:border-blue-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-lg font-black leading-none ${i === p.selected ? 'text-blue-600' : 'text-fg'}`}>{formatDuration(r.duration)}</div>
                        <div className="mt-1 truncate text-[11px] text-muted">
                          {formatDistance(r.distance)}
                          {r.summary ? ` • عبر ${r.summary}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {i === fastest && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">الأسرع ✓</span>}
                        {jam && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">ازدحام</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {p.depart.mode === 'later' && p.routes.length > 0 && !p.calculating && !p.departPast && (
              <p className="text-[10px] text-muted">⏱️ الأوقات مقدّرة حسب الازدحام المتوقع وقت المغادرة المحدد.</p>
            )}
            {p.departPast && <p className="text-[10px] text-amber-600">وقت المغادرة مضى، لذلك حُسب المسار للمغادرة الآن.</p>}

            {/* Steps / options / share share one row (keeps the card short on phones) */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              {route && route.steps.length > 0 && !p.calculating && (
                <button type="button" onClick={() => setShowSteps((v) => !v)} className="text-[11px] font-semibold text-blue-600 hover:underline" data-testid="steps-toggle">
                  {showSteps ? 'إخفاء الخطوات' : `عرض الخطوات (${route.steps.length})`}
                </button>
              )}
              <div className="ms-auto flex items-center gap-3">
                {route && (
                  <button type="button" onClick={p.onShare} className="text-[11px] font-semibold text-muted hover:text-fg" data-testid="share-route">
                    🔗 مشاركة
                  </button>
                )}
                <button type="button" onClick={() => setShowOptions((v) => !v)} className="text-[11px] font-semibold text-muted hover:text-fg" data-testid="options-toggle">
                  ⚙️ الخيارات {optionsActive ? '(مفعّلة)' : ''} {showOptions ? '▲' : '▼'}
                </button>
              </div>

              {showSteps && route && (
                <ol className="max-h-44 basis-full space-y-1 overflow-y-auto pe-1" data-testid="route-steps">
                  {route.steps.map((st, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-surface2 px-2 py-1.5 text-[11px]">
                      <ManeuverIcon maneuver={st.maneuver} size={18} className="shrink-0 text-blue-600" />
                      <span className="min-w-0 flex-1 truncate text-fg">{st.instruction}</span>
                      <span className="shrink-0 font-mono text-muted">{formatDistance(st.distance)}</span>
                    </li>
                  ))}
                </ol>
              )}

              {showOptions && (
                <div className="basis-full space-y-2 rounded-xl bg-surface2/60 p-2.5 text-[11px]" data-testid="options-panel">
                  {p.travelMode === 'driving' ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-muted">المغادرة:</span>
                        <select
                          value={p.depart.mode}
                          onChange={(e) => p.onDepart({ ...p.depart, mode: e.target.value as 'now' | 'later', local: p.depart.local || nowLocalMin() })}
                          className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg"
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
                            className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-fg"
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
                              className="h-3.5 w-3.5 accent-blue-600"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:py-3 sm:text-sm"
            >
              <span className="text-sm">🧭</span>
              <span>{p.canStart ? `ابدأ الملاحة${summary ? ` • ${summary}` : ''}` : p.startHint || 'ابدأ الملاحة'}</span>
            </button>
            {p.canStart && !wp.fromIsGps && (
              <p className="text-center text-[10px] text-muted" data-testid="start-from-gps-note">
                الملاحة تبدأ من موقعك الفعلي (GPS) باتجاه الوجهة.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
