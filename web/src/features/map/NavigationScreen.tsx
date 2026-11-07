/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useMapConfig } from '../../config';
import { createHtmlMarker, loadGoogleMaps, pinHtml, type HtmlMarker } from './googleMaps';
import {
  arrivalClock,
  bearing,
  buildRouteModel,
  computeProgress,
  formatDistance,
  formatDuration,
  haversine,
  pointAt,
  snapToPath,
  speakDistance,
  upcomingManeuver,
  type LatLng,
  type Progress,
  type RouteData,
  type RouteModel,
} from './routeNav';
import { ManeuverIcon } from './ManeuverIcon';

export interface NavTarget {
  label: string;
  coord: LatLng;
}

interface NavigationScreenProps {
  origin: NavTarget;
  destination: NavTarget;
  mode: 'driving' | 'walking';
  route: RouteData; // the route chosen on the planning screen
  startWithGps: boolean; // origin is "my location": follow the real GPS; otherwise preview along the route
  /** Road preferences, kept when the route has to be recalculated. */
  avoid?: { tolls: boolean; highways: boolean; ferries: boolean };
  onExit: () => void;
}

type Source = 'gps' | 'sim';
const SIM_SPEEDS = [1, 5, 15, 40];
const MUTE_KEY = 'nav_muted';

function puckHtml(): string {
  return `<div style="position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(26,115,232,.2)"></div>
    <svg viewBox="0 0 24 24" width="34" height="34" style="transform:rotate(0deg);transition:transform .35s linear;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">
      <path d="M12 2 20 21l-8-4-8 4Z" fill="#1a73e8" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    </svg></div>`;
}

function speak(text: string, muted: boolean) {
  if (muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar-SA';
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* speech is a nice-to-have */
  }
}

export function NavigationScreen({ origin, destination, mode, route, startWithGps, avoid, onExit }: NavigationScreenProps) {
  const { googleMapsApiKey, googleMapId } = useMapConfig();

  // ── render state
  const [model, setModel] = useState<RouteModel>(() => buildRouteModel(route));
  const [progress, setProgress] = useState<Progress>(() => computeProgress(buildRouteModel(route), 0));
  const [source, setSource] = useState<Source>(startWithGps ? 'gps' : 'sim');
  const [simSpeed, setSimSpeed] = useState(SIM_SPEEDS[1]);
  const [status, setStatus] = useState<'navigating' | 'rerouting' | 'arrived'>('navigating');
  const [gpsMsg, setGpsMsg] = useState('');
  const [rerouteErr, setRerouteErr] = useState(false);
  const [follow, setFollow] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // ── refs used by timers / callbacks (always the latest values)
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null);
  const casingRef = useRef<any>(null);
  const remainingRef = useRef<any>(null);
  const passedRef = useRef<any>(null);
  const puckRef = useRef<HtmlMarker | null>(null);
  const destPinRef = useRef<HtmlMarker | null>(null);
  const trafficRef = useRef<any>(null);
  const modelRef = useRef(model);
  const sourceRef = useRef(source);
  const simSpeedRef = useRef(simSpeed);
  const mutedRef = useRef(muted);
  const followRef = useRef(true);
  const headingUpRef = useRef(false); // true when the map is a vector map that can rotate/tilt
  const statusRef = useRef(status);
  const hintRef = useRef(0);
  const alongRef = useRef(0);
  const posRef = useRef<LatLng>(route.geometry.coordinates.length ? { lat: route.geometry.coordinates[0][1], lng: route.geometry.coordinates[0][0] } : origin.coord);
  const headingRef = useRef(0);
  const offCountRef = useRef(0);
  const lastRerouteRef = useRef(0);
  const reroutingRef = useRef(false);
  const announcedRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  const handlePosRef = useRef<(p: LatLng, o: { heading?: number | null; accuracy?: number; src: Source }) => void>(() => {});

  modelRef.current = model;
  sourceRef.current = source;
  simSpeedRef.current = simSpeed;
  mutedRef.current = muted;
  statusRef.current = status;

  // ── map setup
  useEffect(() => {
    if (!googleMapsApiKey) {
      setMapError('خريطة Google غير مفعّلة');
      return;
    }
    let cancelled = false;
    loadGoogleMaps(googleMapsApiKey)
      .then((g) => {
        if (cancelled || !mapDiv.current) return;
        gRef.current = g;
        const map = new g.maps.Map(mapDiv.current, {
          center: posRef.current,
          zoom: mode === 'walking' ? 18 : 17,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          // A Cloud Map ID gives a vector map: heading-up rotation and 3D tilt like Google navigation.
          ...(googleMapId ? { mapId: googleMapId, tilt: mode === 'driving' ? 45 : 0 } : {}),
        });
        mapRef.current = map;
        map.addListener('renderingtype_changed', () => {
          headingUpRef.current = map.getRenderingType?.() === 'VECTOR';
        });
        map.addListener('dragstart', () => {
          followRef.current = false;
          setFollow(false);
        });
        if (mode === 'driving') {
          trafficRef.current = new g.maps.TrafficLayer();
          trafficRef.current.setMap(map);
        }
        const puck = createHtmlMarker(g, posRef.current, puckHtml(), undefined, 'center');
        puck.setMap(map);
        puckRef.current = puck;
        const pin = createHtmlMarker(g, destination.coord, pinHtml('#d93025', destination.label || 'الوجهة', 'B'));
        pin.setMap(map);
        destPinRef.current = pin;
        setMapReady(true);
      })
      .catch((e) => !cancelled && setMapError(e.message));
    return () => {
      cancelled = true;
      puckRef.current?.setMap(null);
      destPinRef.current?.setMap(null);
      trafficRef.current?.setMap(null);
      casingRef.current?.setMap(null);
      remainingRef.current?.setMap(null);
      passedRef.current?.setMap(null);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleMapsApiKey]);

  // ── (re)draw the route whenever the route model changes (start, or after a reroute)
  useEffect(() => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!mapReady || !g || !map) return;
    const path = model.pi.path;
    casingRef.current?.setMap(null);
    remainingRef.current?.setMap(null);
    passedRef.current?.setMap(null);
    casingRef.current = new g.maps.Polyline({ path, strokeColor: '#0b4fb3', strokeOpacity: 0.95, strokeWeight: 11, zIndex: 1, map });
    remainingRef.current = new g.maps.Polyline({ path, strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 7, zIndex: 2, map });
    passedRef.current = new g.maps.Polyline({ path: [], strokeColor: '#9aa0a6', strokeOpacity: 1, strokeWeight: 7, zIndex: 2, map });
  }, [mapReady, model]);

  // ── the heart of navigation: every position (GPS fix or simulated) goes through here
  const handlePosition = useCallback(
    (raw: LatLng, o: { heading?: number | null; accuracy?: number; src: Source }) => {
      if (statusRef.current === 'arrived') return;
      const m = modelRef.current;
      const snap = snapToPath(m.pi, raw, hintRef.current);
      hintRef.current = snap.index;

      // Show the vehicle on the road when it's on the route; show the raw fix when it has left it.
      const onRoute = snap.dist < 35;
      const shown = onRoute ? snap.point : raw;
      if (onRoute) alongRef.current = snap.along;

      // Heading: sensor value when moving, else direction of travel, else the route's direction.
      let heading = headingRef.current;
      if (o.heading != null && Number.isFinite(o.heading)) heading = o.heading;
      else if (haversine(posRef.current, shown) > 3) heading = bearing(posRef.current, shown);
      else if (o.src === 'sim' || onRoute) heading = pointAt(m.pi, snap.along).heading;
      headingRef.current = heading;
      posRef.current = shown;

      const pr = computeProgress(m, snap.along);
      setProgress(pr);

      // ── map
      const g = gRef.current;
      const map = mapRef.current;
      if (g && map) {
        puckRef.current?.setPosition(shown);
        const svg = puckRef.current?.element()?.querySelector('svg') as SVGElement | null;
        // The arrow is relative to the screen: when the map itself rotates (heading-up) it points up.
        if (svg) svg.style.transform = `rotate(${heading - (map.getHeading?.() ?? 0)}deg)`;
        const path = m.pi.path;
        const i = snap.index;
        remainingRef.current?.setPath([snap.point, ...path.slice(i + 1)]);
        casingRef.current?.setPath([snap.point, ...path.slice(i + 1)]);
        passedRef.current?.setPath([...path.slice(0, i + 1), snap.point]);
        if (followRef.current) {
          map.panTo(shown);
          if (headingUpRef.current) map.setHeading(heading);
        }
      }

      // ── arrival
      if (pr.arrived) {
        statusRef.current = 'arrived';
        setStatus('arrived');
        speak('لقد وصلت إلى وجهتك', mutedRef.current);
        return;
      }

      // ── off-route (GPS only: a simulated vehicle is always on the route)
      if (o.src === 'gps') {
        const limit = Math.max(50, (o.accuracy ?? 0) * 2);
        offCountRef.current = snap.dist > limit ? offCountRef.current + 1 : 0;
        if (offCountRef.current >= 3 && Date.now() - lastRerouteRef.current > 8000) {
          void reroute(raw);
          return;
        }
      }

      // ── voice guidance
      const up = upcomingManeuver(m, pr.stepIndex, destination.label);
      const ann = announcedRef.current;
      if (!startedRef.current) {
        startedRef.current = true;
        const first = m.route.steps[0]?.instruction;
        speak(first ? `ابدأ الملاحة. ${first}` : 'ابدأ الملاحة', mutedRef.current);
      }
      const phases = mode === 'walking' ? [100, 40] : [800, 250, 60];
      const stepLen = (m.stepEnd[pr.stepIndex] ?? 0) - (pr.stepIndex ? m.stepEnd[pr.stepIndex - 1] : 0);
      const t = [...phases].reverse().find((x) => pr.distToManeuver <= x); // smallest threshold already crossed
      if (t != null && !ann.has(`${pr.stepIndex}:${t}`) && (t !== phases[0] || stepLen >= phases[0] * 1.2)) {
        phases.filter((x) => x >= t).forEach((x) => ann.add(`${pr.stepIndex}:${x}`));
        const last = t === phases[phases.length - 1];
        // "Continue on X" / road-name changes aren't worth interrupting the driver for.
        const quiet = !up.isArrival && (up.maneuver === 'STRAIGHT' || up.maneuver === 'NAME_CHANGE');
        const text = up.isArrival
          ? last ? 'اقتربت من وجهتك' : `بعد ${speakDistance(pr.distToManeuver)}، ستصل إلى وجهتك`
          : last ? up.instruction : `بعد ${speakDistance(pr.distToManeuver)}، ${up.instruction}`;
        if (!quiet) speak(text, mutedRef.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, destination.label],
  );
  handlePosRef.current = handlePosition;

  // ── recompute the route from the current position
  const reroute = async (from: LatLng) => {
    if (reroutingRef.current) return;
    reroutingRef.current = true;
    lastRerouteRef.current = Date.now();
    setStatus('rerouting');
    statusRef.current = 'rerouting';
    setRerouteErr(false);
    speak('جارٍ إعادة حساب المسار', mutedRef.current);
    try {
      const res = await api.geo.route(from, destination.coord, {
        mode,
        alternatives: false,
        avoidTolls: avoid?.tolls,
        avoidHighways: avoid?.highways,
        avoidFerries: avoid?.ferries,
      });
      const next = buildRouteModel(res.routes?.[0] ?? res);
      hintRef.current = 0;
      alongRef.current = 0;
      offCountRef.current = 0;
      announcedRef.current = new Set();
      modelRef.current = next;
      setModel(next);
      setProgress(computeProgress(next, 0));
    } catch {
      setRerouteErr(true);
    } finally {
      reroutingRef.current = false;
      if (statusRef.current === 'rerouting') {
        statusRef.current = 'navigating';
        setStatus('navigating');
      }
    }
  };

  // ── position source: real GPS or a simulated drive along the route
  useEffect(() => {
    if (!mapReady || status === 'arrived') return;
    if (source === 'gps') {
      if (!('geolocation' in navigator)) {
        setGpsMsg('المتصفح لا يدعم تحديد الموقع. استخدم المعاينة.');
        return;
      }
      setGpsMsg('بانتظار إشارة GPS…');
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsMsg('');
          const { latitude, longitude, heading, speed, accuracy } = pos.coords;
          handlePosRef.current(
            { lat: latitude, lng: longitude },
            { heading: speed != null && speed > 1 && heading != null ? heading : null, accuracy, src: 'gps' },
          );
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setGpsMsg('تم رفض إذن الموقع. فعّله من إعدادات المتصفح أو استخدم المعاينة.');
          else if (err.code === err.POSITION_UNAVAILABLE) setGpsMsg('تعذّر تحديد موقعك. تأكد من تفعيل GPS.');
          else setGpsMsg('إشارة GPS ضعيفة… ما زلنا نحاول.');
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
      return () => navigator.geolocation.clearWatch(id);
    }

    // Simulation: start from where we are on the route.
    setGpsMsg('');
    let along = alongRef.current;
    const base = mode === 'walking' ? 1.4 : 13.9; // m/s (5 km/h walking, 50 km/h driving)
    const tick = window.setInterval(() => {
      const m = modelRef.current;
      along = Math.min(m.pi.total, along + base * simSpeedRef.current * 0.5);
      const p = pointAt(m.pi, along);
      handlePosRef.current(p.point, { heading: p.heading, src: 'sim' });
    }, 500);
    return () => clearInterval(tick);
  }, [mapReady, source, status, mode, model]);

  // ── keep the screen awake while navigating
  useEffect(() => {
    let lock: any = null;
    (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {});
    return () => {
      lock?.release?.().catch?.(() => {});
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (next) window.speechSynthesis?.cancel();
  };

  const recenter = () => {
    followRef.current = true;
    setFollow(true);
    const map = mapRef.current;
    if (map) {
      map.panTo(posRef.current);
      map.setZoom(mode === 'walking' ? 18 : 17);
      if (headingUpRef.current) map.setHeading(headingRef.current);
    }
  };

  // Whole remaining route on screen (Google's "route overview").
  const overview = () => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    followRef.current = false;
    setFollow(false);
    const bounds = new g.maps.LatLngBounds();
    const m = modelRef.current;
    bounds.extend(posRef.current);
    m.pi.path.slice(Math.max(0, hintRef.current)).forEach((p) => bounds.extend(p));
    if (headingUpRef.current) {
      map.setHeading(0);
      map.setTilt(0);
    }
    map.fitBounds(bounds, { top: 190, right: 40, bottom: 120, left: 40 });
  };

  // ── derived UI values
  const up = upcomingManeuver(model, progress.stepIndex, destination.label);
  const atStart = alongRef.current < 15 && progress.stepIndex === 0 && !up.isArrival;
  const afterNext = model.route.steps[progress.stepIndex + 2];
  const bannerManeuver = atStart ? model.route.steps[0]?.maneuver ?? 'DEPART' : up.maneuver;
  const bannerText = atStart ? model.route.steps[0]?.instruction || up.instruction : up.instruction;
  const bannerDist = atStart ? progress.distToManeuver : progress.distToManeuver;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900 text-white" dir="rtl">
      <div ref={mapDiv} className="absolute inset-0" />

      {mapError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center">
          <p className="font-semibold">تعذّر تحميل الخريطة: {mapError}</p>
          <button onClick={onExit} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">رجوع</button>
        </div>
      )}

      {/* ───── Turn banner ───── */}
      <div className="absolute inset-x-2 top-2 z-10 space-y-2 sm:inset-x-auto sm:start-4 sm:top-4 sm:w-[26rem]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="overflow-hidden rounded-2xl bg-[#0b6b3a] shadow-2xl">
          <div className="flex items-center gap-3 p-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/15">
              <ManeuverIcon maneuver={bannerManeuver} size={40} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-black leading-tight" dir="rtl" data-testid="nav-distance">
                {atStart ? 'انطلق' : formatDistance(bannerDist)}
              </div>
              <div className="line-clamp-2 text-sm font-semibold leading-snug text-white/95" data-testid="nav-instruction">
                {bannerText}
              </div>
            </div>
          </div>
          {afterNext && !up.isArrival && (
            <div className="flex items-center gap-2 border-t border-white/15 bg-black/15 px-3 py-1.5 text-xs">
              <span className="text-white/70">ثم</span>
              <ManeuverIcon maneuver={afterNext.maneuver} size={18} />
              <span className="truncate">{afterNext.instruction}</span>
            </div>
          )}
        </div>

        {status === 'rerouting' && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-lg">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            جارٍ إعادة حساب المسار…
          </div>
        )}
        {rerouteErr && status !== 'rerouting' && (
          <div className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold shadow-lg">تعذّر إعادة حساب المسار، سنحاول مجدداً عند الحاجة.</div>
        )}
        {source === 'gps' && gpsMsg && (
          <div className="rounded-xl bg-slate-800/95 px-3 py-2 text-xs shadow-lg">
            {gpsMsg}
            {gpsMsg.startsWith('تم رفض') && (
              <button onClick={() => setSource('sim')} className="ms-2 rounded-lg bg-white/15 px-2 py-0.5 font-bold">معاينة الرحلة</button>
            )}
          </div>
        )}
        {source === 'sim' && (
          <div className="flex items-center gap-2 rounded-xl bg-indigo-600/95 px-3 py-2 text-xs font-bold shadow-lg">
            <span>🎬 معاينة الرحلة (محاكاة)</span>
            <button
              onClick={() => setSimSpeed((s) => SIM_SPEEDS[(SIM_SPEEDS.indexOf(s) + 1) % SIM_SPEEDS.length])}
              className="ms-auto rounded-lg bg-white/20 px-2 py-0.5"
              data-testid="nav-speed"
            >
              ×{simSpeed}
            </button>
            <button onClick={() => setSource('gps')} className="rounded-lg bg-white/20 px-2 py-0.5" data-testid="nav-use-gps">
              استخدم موقعي الفعلي
            </button>
          </div>
        )}
      </div>

      {/* ───── Re-center / overview ───── */}
      {status !== 'arrived' && (
        <div className="absolute bottom-28 end-3 z-10 flex flex-col items-end gap-2">
          <button
            onClick={overview}
            className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-2xl active:scale-95"
            data-testid="nav-overview"
          >
            🗺️ نظرة عامة
          </button>
          {!follow && (
            <button
              onClick={recenter}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-blue-600 shadow-2xl active:scale-95"
              data-testid="nav-recenter"
            >
              🎯 إعادة التركيز
            </button>
          )}
        </div>
      )}

      {/* ───── Bottom bar ───── */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-white text-slate-900 shadow-[0_-6px_24px_rgba(0,0,0,.25)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={onExit}
            className="shrink-0 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white shadow active:scale-95"
            data-testid="nav-exit"
          >
            إنهاء
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-xl font-black text-emerald-700" data-testid="nav-eta">
              {arrivalClock(progress.remainingDur)}
            </div>
            <div className="text-xs text-slate-500" data-testid="nav-remaining">
              {formatDuration(progress.remainingDur)} • {formatDistance(progress.remainingDist)}
            </div>
          </div>
          <button
            onClick={toggleMute}
            title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-lg active:scale-95"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* ───── Arrived ───── */}
      {status === 'arrived' && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/50 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl" data-testid="nav-arrived">
            <div className="text-5xl">🏁</div>
            <h2 className="mt-2 text-xl font-black">وصلت إلى وجهتك</h2>
            <p className="mt-1 text-sm text-slate-600">{destination.label}</p>
            <button onClick={onExit} className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">تم</button>
          </div>
        </div>
      )}
    </div>
  );
}

