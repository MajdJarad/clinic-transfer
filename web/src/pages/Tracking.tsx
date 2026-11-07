import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { StatusPill } from '../components/ui';
import { driverStatusKeys } from '../labels';
import { ageLabel, FRESHNESS_COLOR, freshnessOf, type Freshness } from '../features/tracking/freshness';
import { plateLetters } from '../features/tracking/plate';
import { TrackingMap, type TrackingMapHandle } from '../features/tracking/TrackingMap';
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
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    if (drivers.some((d) => d.id === want && d.lat != null)) {
      focused.current = true;
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
  const counts = useMemo(() => {
    const c: Record<Freshness, number> = { live: 0, recent: 0, stale: 0, none: 0 };
    view.forEach((d) => c[freshnessOf(d.ageSeconds)]++);
    return c;
  }, [view]);

  const btn = 'rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-xs font-semibold text-fg shadow-lg backdrop-blur-md';

  return (
    <div
      className={`w-full overflow-hidden bg-slate-900 ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : 'relative h-[calc(100dvh-10rem)] rounded-2xl sm:h-[calc(100vh-6.5rem)]'
      }`}
      data-testid="tracking-screen"
    >
      <TrackingMap
        ref={mapApi}
        drivers={view}
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

      {/* Title + counts */}
      <div className="absolute inset-x-3 top-3 z-20 flex flex-wrap items-center gap-2 sm:end-auto sm:max-w-[60%]" data-testid="tracking-summary">
        <span className="rounded-lg bg-surface/95 px-3 py-1.5 text-sm font-black text-fg shadow-lg backdrop-blur-md">{t('tracking.title')}</span>
        {(['live', 'recent', 'stale', 'none'] as Freshness[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 rounded-full border border-border bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-fg shadow backdrop-blur-md">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FRESHNESS_COLOR[k] }} />
            {LEVEL_TEXT[k]} <b data-testid={`count-${k}`}>{counts[k]}</b>
          </span>
        ))}
        <span className={`rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur-md ${offline ? 'text-red-600' : 'text-muted'}`} data-testid="tracking-status">
          {offline ? '⚠️ انقطع الاتصال… نحاول مجدداً' : loaded ? `آخر تحديث ${new Date(fetchedAt).toLocaleTimeString('en-GB')}` : 'جارٍ التحميل…'}
        </span>
      </div>

      {/* Map buttons */}
      <div className="absolute end-3 top-3 z-20 flex flex-col items-end gap-2 max-sm:top-24">
        <button type="button" onClick={() => setPanelOpen((v) => !v)} className={btn} data-testid="toggle-panel">
          🚗 السائقون ({view.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setFollowId(null);
            setFitSignal((n) => n + 1);
          }}
          className={btn}
          data-testid="fit-all"
        >
          🎯 عرض الكل
        </button>
        <button type="button" onClick={() => setTraffic((v) => !v)} className={`${btn} ${traffic ? '!bg-amber-600 !text-white' : ''}`}>
          🚦 المرور
        </button>
        <button type="button" onClick={() => setIsFullscreen((v) => !v)} className={btn} data-testid="tracking-fullscreen">
          {isFullscreen ? '🗗 تصغير' : '⛶ ملء الشاشة'}
        </button>
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface/95 shadow-lg backdrop-blur-md">
          <button type="button" onClick={() => mapApi.current?.zoomBy(1)} className="h-9 w-9 text-base font-bold text-fg" aria-label="تكبير">
            +
          </button>
          <button type="button" onClick={() => mapApi.current?.zoomBy(-1)} className="h-9 w-9 border-s border-border text-base font-bold text-fg" aria-label="تصغير">
            −
          </button>
        </div>
      </div>

      {/* Drivers panel: a side card on wide screens, a bottom sheet on phones */}
      {panelOpen && (
        <div
          className="absolute inset-x-2 bottom-2 z-20 max-h-[42%] space-y-2 overflow-y-auto rounded-2xl border border-border bg-surface/95 p-2.5 shadow-2xl backdrop-blur-md md:inset-x-auto md:bottom-3 md:start-3 md:top-14 md:max-h-none md:w-80"
          data-testid="driver-list"
        >
          {sorted.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">{loaded ? t('tracking.noLocations') : 'جارٍ التحميل…'}</p>
          ) : (
            sorted.map((d) => {
              const level = freshnessOf(d.ageSeconds);
              const located = d.lat != null && d.lng != null;
              const onTrip = d.activeTrip;
              return (
                <div
                  key={d.id}
                  data-testid={`driver-row-${d.id}`}
                  onClick={() => located && (setSelectedId(d.id), setFollowId(null))}
                  className={`cursor-pointer rounded-xl border p-2.5 transition ${selectedId === d.id ? 'border-blue-500 bg-blue-500/5' : 'border-border hover:border-blue-300'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-fg">
                      <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-black tracking-wide text-white" data-testid={`plate-${d.id}`}>
                        {plateLetters(d.vehicle?.plate, d.name)}
                      </span>
                      <span className="truncate">{d.name}</span>
                    </span>
                    <StatusPill status={d.status} label={t(driverStatusKeys[d.status])} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted">{d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} • ${d.vehicle.plate}` : t('tracking.noVehicle')}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: FRESHNESS_COLOR[level] }} data-testid={`driver-age-${d.id}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: FRESHNESS_COLOR[level] }} />
                    {LEVEL_TEXT[level]} • {ageLabel(d.ageSeconds)}
                    {level === 'live' && d.speedKmh != null && d.speedKmh >= 1 ? ` • ${Math.round(d.speedKmh)} كم/س` : ''}
                  </p>
                  {located && (
                    <p className="mt-0.5 text-[10px] text-muted" dir="ltr" data-testid={`driver-pos-${d.id}`}>
                      {(d.lat as number).toFixed(5)}, {(d.lng as number).toFixed(5)}
                      {d.accuracy != null ? `  ±${Math.round(d.accuracy)}m` : ''}
                    </p>
                  )}
                  {onTrip && (
                    <p className="mt-1 truncate rounded-lg bg-surface2 px-2 py-1 text-[11px] font-semibold text-fg" data-testid={`driver-trip-${d.id}`}>
                      {onTrip.status === 'PICKED_UP' ? '🏥 إلى الوجهة' : '🧑‍⚕️ إلى المريض'} • {onTrip.patientName}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={!located}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(d.id);
                        setFollowId(followId === d.id ? null : d.id);
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold disabled:opacity-40 ${
                        followId === d.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-border bg-surface2 text-fg'
                      }`}
                      data-testid={`follow-${d.id}`}
                    >
                      {followId === d.id ? '👁️ يتم التتبع' : '👁️ تتبّع'}
                    </button>
                    {d.phone && (
                      <a href={`tel:${d.phone}`} onClick={(e) => e.stopPropagation()} className="rounded-lg border border-border bg-surface2 px-3 py-1 text-[11px] font-bold text-fg">
                        📞
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
