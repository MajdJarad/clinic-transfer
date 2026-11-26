import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { StatusPill } from '../components/ui';
import { driverStatusKeys } from '../labels';
import { ageLabel, FRESHNESS_COLOR, freshnessOf, isCurrent, type Freshness } from '../features/tracking/freshness';
import { plateLetters } from '../features/tracking/plate';
import { TrackingMap, type TrackingMapHandle } from '../features/tracking/TrackingMap';
import { MAP_BTN, MAP_BTN_ON, MAP_PANEL } from '../features/map/mapUi';
import type { TrackingDriver } from '../types';

const POLL_MS = 3000; // phones report every few seconds; the screen asks as often

const RANK: Record<Freshness, number> = { live: 0, recent: 1, stale: 2, none: 3 };
const LEVEL_TEXT: Record<Freshness, string> = { live: 'مباشر', recent: 'حديث', stale: 'غير متصل', none: 'بلا موقع' };

/** Live tracking: a full-screen map with every driver's car, and a panel with the details. */
export function Tracking() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const mapApi = useRef<TrackingMapHandle>(null);
  const [drivers, setDrivers] = useState<TrackingDriver[]>([]);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followId, setFollowId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [traffic, setTraffic] = useState(false);
  const [hideQuiet, setHideQuiet] = useState(false); // drivers who stopped reporting stay on the map, grey, with their age
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [q, setQ] = useState(''); // search box of the drivers panel
  const focused = useRef(false);

  // Ask for fresh positions every few seconds (not while the tab is hidden), and at once on return.
  useEffect(() => {
    let alive = true;
    const pull = () => {
      if (document.visibilityState === 'hidden') return;
      api.drivers
        .live()
        .then((d) => {
          if (!alive) return;
          setDrivers(d);
          setFetchedAt(Date.now());
          setLoaded(true);
          setOffline(false);
        })
        .catch(() => alive && setOffline(true));
    };
    pull();
    const id = setInterval(pull, POLL_MS);
    document.addEventListener('visibilitychange', pull);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', pull);
    };
  }, []);

  // Arriving from an alert ("show on map") focuses that driver once.
  useEffect(() => {
    const want = params.get('driver');
    if (!want || focused.current || !loaded) return;
    const target = drivers.find((d) => d.id === want && d.lat != null && d.lng != null);
    if (target) {
      focused.current = true;
      setHideQuiet(false); // an alert from a driver who went quiet: show where he was last heard
      setSelectedId(want);
      setFollowId(want);
    }
  }, [params, drivers, loaded]);

  // The server sent how old each position was at that moment; keep counting between polls.
  const view = useMemo(
    () => drivers.map((d) => ({ ...d, ageSeconds: d.ageSeconds == null ? null : d.ageSeconds + Math.max(0, (now - fetchedAt) / 1000) })),
    [drivers, now, fetchedAt],
  );
  const sorted = useMemo(
    () => [...view].sort((a, b) => RANK[freshnessOf(a.ageSeconds)] - RANK[freshnessOf(b.ageSeconds)] || a.name.localeCompare(b.name)),
    [view],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((d) =>
      [d.name, d.vehicle?.plate, d.vehicle?.make, d.vehicle?.model, plateLetters(d.vehicle?.plate, d.name)].some((x) => (x ?? '').toLowerCase().includes(needle)),
    );
  }, [sorted, q]);
  // Real positions only: current ones in colour; a driver who stopped reporting stays where he was last heard,
  // drawn grey and labelled with how long ago (positions older than 12 h are not returned by the server).
  const mapDrivers = useMemo(
    () => view.filter((d) => d.lat != null && d.lng != null && (!hideQuiet || isCurrent(d))),
    [view, hideQuiet],
  );
  const staleCount = useMemo(() => view.filter((d) => d.lat != null && d.lng != null && !isCurrent(d)).length, [view]);
  const counts = useMemo(() => {
    const c: Record<Freshness, number> = { live: 0, recent: 0, stale: 0, none: 0 };
    view.forEach((d) => c[freshnessOf(d.ageSeconds)]++);
    return c;
  }, [view]);

  const rowBtn = 'h-9 rounded-full text-xs font-medium transition disabled:opacity-40';

  return (
    <div
      className={`w-full overflow-hidden bg-slate-900 ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : 'relative h-[calc(100dvh-10rem-var(--chrome-extra,0px))] rounded-3xl sm:h-[calc(100vh-6.5rem-var(--chrome-extra,0px))]'
      }`}
      data-testid="tracking-screen"
    >
      <TrackingMap
        ref={mapApi}
        drivers={mapDrivers}
        selectedId={selectedId}
        followId={followId}
        onSelect={(id) => {
          setSelectedId(id);
          setFollowId(null);
          setPanelOpen(true);
        }}
        fitSignal={fitSignal}
        traffic={traffic}
        className="absolute inset-0 h-full w-full"
      />

      {/* Start column: the summary card on top, the drivers panel under it (a bottom sheet on phones) */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 top-3 z-20 flex flex-col gap-3 sm:inset-x-auto sm:bottom-4 sm:start-4 sm:top-4 sm:w-96">
        <div className={`pointer-events-auto ${MAP_PANEL} p-3.5`} data-testid="tracking-summary">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-[15px] font-semibold text-fg">{t('tracking.title')}</h1>
            <span className={`shrink-0 text-xs ${offline ? 'font-medium text-red-600' : 'text-muted'}`} data-testid="tracking-status">
              {offline ? 'انقطع الاتصال… نحاول مجدداً' : loaded ? `آخر تحديث ${new Date(fetchedAt).toLocaleTimeString('en-GB')}` : 'جارٍ التحميل…'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(['live', 'recent', 'stale', 'none'] as Freshness[]).map((k) => (
              <div key={k} className="rounded-2xl bg-surface2 px-1 py-2 text-center">
                <b className="block text-lg font-semibold leading-none text-fg" data-testid={`count-${k}`}>{counts[k]}</b>
                <span className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: FRESHNESS_COLOR[k] }} />
                  {LEVEL_TEXT[k]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Drivers panel */}
        {panelOpen && (
          <div
            className={`pointer-events-auto mt-auto flex max-h-[42%] min-h-0 flex-col overflow-hidden ${MAP_PANEL} sm:mt-0 sm:max-h-none sm:flex-1`}
            data-testid="driver-list"
          >
            <div className="shrink-0 p-3 pb-2">
              <div className="flex h-11 items-center gap-2.5 rounded-full bg-surface2 px-4">
                <Icon name="search" className="h-[18px] w-[18px] shrink-0 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث عن سائق أو لوحة…"
                  className="w-full bg-transparent text-sm text-fg placeholder-muted outline-none"
                  data-testid="driver-search"
                />
                {q && (
                  <button type="button" onClick={() => setQ('')} aria-label="مسح" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:text-fg">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 pt-1">
              {shown.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted">{!loaded ? 'جارٍ التحميل…' : q ? 'لا توجد نتائج' : t('tracking.noLocations')}</p>
              ) : (
                shown.map((d) => {
                  const level = freshnessOf(d.ageSeconds);
                  const located = d.lat != null && d.lng != null;
                  const onMap = located && (!hideQuiet || isCurrent(d)); // is his car actually drawn?
                  const onTrip = d.activeTrip;
                  return (
                    <div
                      key={d.id}
                      data-testid={`driver-row-${d.id}`}
                      onClick={() => onMap && (setSelectedId(d.id), setFollowId(null))}
                      className={`cursor-pointer rounded-2xl p-3.5 transition ${selectedId === d.id ? 'bg-accent-soft ring-2 ring-brand-500/25' : 'bg-surface2/70 hover:bg-surface2'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold tracking-wide text-white dark:bg-white/15" data-testid={`plate-${d.id}`}>
                            {plateLetters(d.vehicle?.plate, d.name)}
                          </span>
                          <span className="truncate text-sm font-medium text-fg">{d.name}</span>
                        </span>
                        <StatusPill status={d.status} label={t(driverStatusKeys[d.status])} />
                      </div>
                      <p className="mt-2 truncate text-xs text-muted">{d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} • ${d.vehicle.plate}` : t('tracking.noVehicle')}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: FRESHNESS_COLOR[level] }} data-testid={`driver-age-${d.id}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: FRESHNESS_COLOR[level] }} />
                        {LEVEL_TEXT[level]} • {ageLabel(d.ageSeconds)}
                        {level === 'live' && d.speedKmh != null && d.speedKmh >= 1 ? ` • ${Math.round(d.speedKmh)} كم/س` : ''}
                      </p>
                      {located && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                          {isCurrent(d) && (
                            <span data-testid={`driver-source-${d.id}`}>
                              <Icon name={d.source === 'traccar' ? 'signal' : 'mobile'} inline className="h-3.5 w-3.5" />{d.source === 'traccar' ? 'من جهاز التتبع' : 'من هاتف السائق (GPS)'}
                            </span>
                          )}
                          <span dir="ltr" data-testid={`driver-pos-${d.id}`}>
                            {(d.lat as number).toFixed(5)}, {(d.lng as number).toFixed(5)}
                            {d.accuracy != null ? `  ±${Math.round(d.accuracy)}m` : ''}
                          </span>
                        </div>
                      )}
                      {located && !isCurrent(d) && (
                        <p className="mt-1.5 text-xs font-medium text-muted" data-testid={`driver-stale-${d.id}`}>
                          {hideQuiet ? 'توقف عن الإرسال — مخفي من الخريطة' : 'توقف عن الإرسال — آخر موقع معروف (رمادي على الخريطة)'}
                        </p>
                      )}
                      {onTrip && (
                        <p className="mt-2.5 truncate rounded-xl bg-surface px-3 py-2 text-xs font-medium text-fg" data-testid={`driver-trip-${d.id}`}>
                          <Icon name={onTrip.status === 'PICKED_UP' ? 'clinic' : 'heart'} inline className="h-3.5 w-3.5" />{onTrip.status === 'PICKED_UP' ? 'إلى الوجهة' : 'إلى المريض'} • {onTrip.patientName}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={!onMap}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(d.id);
                            setFollowId(followId === d.id ? null : d.id);
                          }}
                          className={`${rowBtn} flex-1 ${followId === d.id ? 'bg-brand-600 text-white shadow-md' : 'bg-surface text-fg shadow-sm hover:bg-white dark:hover:bg-slate-800'}`}
                          data-testid={`follow-${d.id}`}
                        >
                          <Icon name="eye" inline className="h-3.5 w-3.5" />{followId === d.id ? 'يتم التتبع' : 'تتبّع'}
                        </button>
                        {located && !isCurrent(d) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void api.drivers.clearLocation(d.id).then(() => setDrivers((all) => all.map((x) => (x.id === d.id ? { ...x, lat: null, lng: null, lastSeen: null, ageSeconds: null } : x))));
                            }}
                            className={`${rowBtn} bg-surface px-3.5 text-fg shadow-sm`}
                            title="مسح آخر موقع معروف"
                            data-testid={`clear-${d.id}`}
                          >
                            <Icon name="trash" inline className="h-3.5 w-3.5" /> مسح
                          </button>
                        )}
                        {d.phone && (
                          <a href={`tel:${d.phone}`} onClick={(e) => e.stopPropagation()} aria-label="اتصال" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-sm">
                            <Icon name="phone" className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Round map buttons: same size and place as on the map screen */}
      <div className="absolute end-3 top-[8.25rem] z-20 flex flex-col items-end gap-2.5 sm:end-4 sm:top-4">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className={`${MAP_BTN} relative ${panelOpen ? MAP_BTN_ON : ''}`}
          data-testid="toggle-panel"
          title={`السائقون (${view.length})`}
          aria-label={`السائقون (${view.length})`}
        >
          <Icon name="users" className="h-5 w-5" />
          <span className="absolute -end-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white ring-2 ring-surface">{view.length}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setFollowId(null);
            setFitSignal((n) => n + 1);
          }}
          className={MAP_BTN}
          data-testid="fit-all"
          title="عرض الكل"
          aria-label="عرض الكل"
        >
          <Icon name="target" className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setTraffic((v) => !v)} className={`${MAP_BTN} ${traffic ? MAP_BTN_ON : ''}`} title="حركة المرور" aria-label="حركة المرور" aria-pressed={traffic}>
          <Icon name="traffic" className="h-5 w-5" />
        </button>
        {staleCount > 0 && (
          <button
            type="button"
            onClick={() => setHideQuiet((v) => !v)}
            className={`${MAP_BTN} relative ${hideQuiet ? MAP_BTN_ON : ''}`}
            data-testid="toggle-stale"
            title={hideQuiet ? `إظهار المتوقفين (${staleCount})` : `إخفاء المتوقفين (${staleCount})`}
            aria-label={hideQuiet ? `إظهار المتوقفين (${staleCount})` : `إخفاء المتوقفين (${staleCount})`}
            aria-pressed={hideQuiet}
          >
            <Icon name="clock" className="h-5 w-5" />
            <span className="absolute -end-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-slate-500 px-1 text-[10px] font-semibold text-white ring-2 ring-surface">{staleCount}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          className={MAP_BTN}
          data-testid="tracking-fullscreen"
          title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
          aria-label={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
        >
          <Icon name={isFullscreen ? 'shrink' : 'expand'} className="h-5 w-5" />
        </button>
        <div className="hidden flex-col overflow-hidden rounded-full bg-surface shadow-float sm:flex">
          <button type="button" onClick={() => mapApi.current?.zoomBy(1)} className="grid h-11 w-11 place-items-center text-fg transition hover:bg-surface2" aria-label="تكبير" title="تكبير">
            <Icon name="plus" className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => mapApi.current?.zoomBy(-1)} className="grid h-11 w-11 place-items-center text-fg transition hover:bg-surface2" aria-label="تصغير" title="تصغير">
            <span className="block h-[1.7px] w-[14px] rounded bg-current" />
          </button>
        </div>
      </div>
    </div>
  );
}
