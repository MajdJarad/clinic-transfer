/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useMapConfig } from '../../config';
import { useTheme } from '../../theme';
import { createHtmlMarker, loadGoogleMaps, pinHtml, type HtmlMarker } from './googleMaps';
import { DARK_STYLE } from './mapStyles';
import {
  arrivalClock,
  bearing,
  buildRouteModel,
  computeProgress,
  formatDistance,
  formatDuration,
  haversine,
  isSameRoute,
  pointAt,
  snapToPath,
  speakDistance,
  trafficAhead,
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
  destination: NavTarget;
  mode: 'driving' | 'walking';
  /** The route shown on the planning screen. Navigation always runs from the real GPS position: if
   *  that is not on this route, a fresh route from where the vehicle actually is replaces it. */
  route: RouteData;
  /** Road preferences, kept whenever the route is recalculated. */
  avoid?: { tolls: boolean; highways: boolean; ferries: boolean };
  /** Optional action on the arrival card (e.g. the trip's next status: "arrived at the patient"). */
  arrivalAction?: { label: string; run: () => Promise<void> | void };
  /** A second, optional action on the arrival card (e.g. tell the patient the car is here). */
  secondaryAction?: { label: string; run: () => Promise<string | void> | string | void };
  onExit: () => void;
}

const MUTE_KEY = 'nav_muted';
const TRAFFIC_REFRESH_MS = 150_000; // live traffic is re-checked this often
const SUGGESTION_SNOOZE_MS = 5 * 60_000;

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

/**
 * Browsers (iOS Safari especially) only allow speech that was started from a tap. Call this from the
 * "start navigation" click so the voice guidance that begins later, on the first GPS fix, is allowed.
 */
export function unlockSpeech() {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  } catch {
    /* no speech support: guidance stays visual */
  }
}

type Status = 'locating' | 'navigating' | 'rerouting' | 'arrived';

export function NavigationScreen({ destination, mode, route, avoid, arrivalAction, secondaryAction, onExit }: NavigationScreenProps) {
  const { googleMapsApiKey, googleMapId } = useMapConfig();
  const { theme } = useTheme();

  // ── render state
  const [model, setModel] = useState<RouteModel>(() => buildRouteModel(route));
  const [progress, setProgress] = useState<Progress>(() => computeProgress(buildRouteModel(route), 0));
  const [status, setStatus] = useState<Status>('locating');
  const [gpsError, setGpsError] = useState(''); // fatal: no position can be obtained
  const [gpsNote, setGpsNote] = useState(''); // transient: weak signal
  const [gpsTry, setGpsTry] = useState(0);
  const [rerouteErr, setRerouteErr] = useState(false);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [suggest, setSuggest] = useState<{ model: RouteModel; savedSec: number } | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [secondaryNote, setSecondaryNote] = useState('');
  const [secondaryBusy, setSecondaryBusy] = useState(false);
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
  const trafficLayerRef = useRef<any>(null);
  const modelRef = useRef(model);
  const progressRef = useRef(progress);
  const mutedRef = useRef(muted);
  const followRef = useRef(true);
  const headingUpRef = useRef(false); // true when the map is a vector map that can rotate/tilt
  const statusRef = useRef<Status>('locating');
  const hintRef = useRef(0);
  const alongRef = useRef(0);
  const posRef = useRef<LatLng>(
    route.geometry.coordinates.length ? { lat: route.geometry.coordinates[0][1], lng: route.geometry.coordinates[0][0] } : destination.coord,
  );
  const headingRef = useRef(0);
  const firstFixRef = useRef(true);
  const offCountRef = useRef(0);
  const lastRerouteRef = useRef(0);
  const reroutingRef = useRef(false);
  const snoozeUntilRef = useRef(0);
  const announcedRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  const handlePosRef = useRef<(p: LatLng, o: { heading?: number | null; accuracy?: number; speed?: number | null }) => void>(() => {});

  modelRef.current = model;
  progressRef.current = progress;
  mutedRef.current = muted;

  const setStatusBoth = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

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
        // Live traffic on every road, not only on the route.
        if (mode === 'driving') {
          trafficLayerRef.current = new g.maps.TrafficLayer();
          trafficLayerRef.current.setMap(map);
        }
        const pin = createHtmlMarker(g, destination.coord, pinHtml('#d93025', destination.label || 'الوجهة', 'B'));
        pin.setMap(map);
        destPinRef.current = pin;
        setMapReady(true);
      })
      .catch((e) => !cancelled && setMapError(e.message));
    return () => {
      cancelled = true;
      puckRef.current?.setMap(null);
      puckRef.current = null;
      destPinRef.current?.setMap(null);
      trafficLayerRef.current?.setMap(null);
      casingRef.current?.setMap(null);
      remainingRef.current?.setMap(null);
      passedRef.current?.setMap(null);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleMapsApiKey]);

  // Night map in dark mode (a Cloud Map ID carries its own style)
  useEffect(() => {
    if (!mapReady || googleMapId) return;
    mapRef.current?.setOptions({ styles: theme === 'dark' ? DARK_STYLE : [] });
  }, [mapReady, theme, googleMapId]);

  // ── (re)draw the route whenever the route model changes (start, reroute, traffic refresh).
  // Layers: blue road line, congestion colors over it (amber = slow, red = jam), and the part already
  // driven in grey on top of both.
  useEffect(() => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!mapReady || !g || !map) return;
    const path = model.pi.path;
    const congestion = model.route.traffic.map(
      (t) =>
        new g.maps.Polyline({
          path: path.slice(t.from, t.to + 1),
          strokeColor: t.speed === 'TRAFFIC_JAM' ? '#d93025' : '#f9ab00',
          strokeOpacity: 1,
          strokeWeight: 7,
          zIndex: 3,
          map,
        }),
    );
    casingRef.current = new g.maps.Polyline({ path, strokeColor: '#0b4fb3', strokeOpacity: 0.95, strokeWeight: 11, zIndex: 1, map });
    remainingRef.current = new g.maps.Polyline({ path, strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 7, zIndex: 2, map });
    passedRef.current = new g.maps.Polyline({ path: [], strokeColor: '#9aa0a6', strokeOpacity: 1, strokeWeight: 8, zIndex: 4, map });
    return () => {
      congestion.forEach((c: any) => c.setMap(null));
      casingRef.current?.setMap(null);
      remainingRef.current?.setMap(null);
      passedRef.current?.setMap(null);
    };
  }, [mapReady, model]);

  // Mark the announcements that are already behind us on a (new) route so they are not repeated.
  const markAnnounced = (m: RouteModel, pr: Progress) => {
    const phases = mode === 'walking' ? [100, 40] : [800, 250, 60];
    const crossed = phases.filter((x) => pr.distToManeuver <= x);
    const set = new Set<string>();
    crossed.forEach((x) => set.add(`${pr.stepIndex}:${x}`));
    announcedRef.current = set;
    void m;
  };

  // Use a different route model from the current position onwards.
  const swapModel = (next: RouteModel) => {
    hintRef.current = 0;
    alongRef.current = 0;
    offCountRef.current = 0;
    modelRef.current = next;
    const pr = computeProgress(next, 0);
    markAnnounced(next, pr);
    progressRef.current = pr;
    setModel(next);
    setProgress(pr);
  };

  const routeOptions = () => ({
    mode,
    alternatives: false,
    avoidTolls: avoid?.tolls,
    avoidHighways: avoid?.highways,
    avoidFerries: avoid?.ferries,
  });

  // ── recompute the route from the real position (left the route, or first fix far from the plan)
  const reroute = async (from: LatLng) => {
    if (reroutingRef.current) return;
    reroutingRef.current = true;
    lastRerouteRef.current = Date.now();
    const wasLocating = statusRef.current === 'locating';
    setStatusBoth('rerouting');
    setRerouteErr(false);
    setSuggest(null);
    if (!wasLocating) speak('جارٍ إعادة حساب المسار', mutedRef.current);
    try {
      const res = await api.geo.route(from, destination.coord, routeOptions());
      swapModel(buildRouteModel(res.routes?.[0] ?? res));
      announcedRef.current = new Set();
    } catch {
      setRerouteErr(true);
    } finally {
      reroutingRef.current = false;
      if (statusRef.current === 'rerouting') setStatusBoth('navigating');
    }
  };

  // ── live traffic: every few minutes ask for the current conditions. The same road just gets its
  // ETA and congestion colors refreshed; a different, clearly faster route is offered to the driver.
  const refreshTraffic = async () => {
    if (mode !== 'driving' || reroutingRef.current || statusRef.current !== 'navigating') return;
    try {
      const res = await api.geo.route(posRef.current, destination.coord, routeOptions());
      if (statusRef.current !== 'navigating') return;
      const fresh = buildRouteModel(res.routes?.[0] ?? res);
      if (isSameRoute(modelRef.current.pi, fresh.pi)) {
        swapModel(fresh);
        return;
      }
      const cur = progressRef.current;
      const saved = cur.remainingDur - fresh.route.duration;
      if (saved >= Math.max(120, cur.remainingDur * 0.1) && Date.now() > snoozeUntilRef.current) setSuggest({ model: fresh, savedSec: saved });
    } catch {
      /* the next refresh will try again */
    }
  };

  useEffect(() => {
    if (!mapReady || status === 'arrived' || status === 'locating') return;
    const id = window.setInterval(() => void refreshTraffic(), TRAFFIC_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, status]);

  // The offer to switch routes disappears by itself if the driver ignores it.
  useEffect(() => {
    if (!suggest) return;
    const id = window.setTimeout(() => {
      snoozeUntilRef.current = Date.now() + SUGGESTION_SNOOZE_MS;
      setSuggest(null);
    }, 25_000);
    return () => clearTimeout(id);
  }, [suggest]);

  // ── the heart of navigation: every real GPS fix goes through here
  const handlePosition = useCallback(
    (raw: LatLng, o: { heading?: number | null; accuracy?: number; speed?: number | null }) => {
      if (statusRef.current === 'arrived') return;
      const m = modelRef.current;
      const snap = snapToPath(m.pi, raw, hintRef.current);
      hintRef.current = snap.index;
      const limit = Math.max(50, (o.accuracy ?? 0) * 2);

      // The very first fix: if the vehicle is not on the planned route (e.g. the plan started elsewhere),
      // plan again from where it really is before showing anything.
      if (firstFixRef.current) {
        firstFixRef.current = false;
        setGpsNote('');
        posRef.current = raw;
        if (snap.dist > limit) {
          void reroute(raw);
          return;
        }
        setStatusBoth('navigating');
      }

      setSpeedKmh(o.speed != null && o.speed >= 0 ? Math.round(o.speed * 3.6) : null);

      // Show the vehicle on the road when it's on the route; show the raw fix when it has left it.
      const onRoute = snap.dist < 35;
      const shown = onRoute ? snap.point : raw;
      if (onRoute) alongRef.current = snap.along;

      // Heading: sensor value when moving, else direction of travel, else the route's direction.
      let heading = headingRef.current;
      if (o.heading != null && Number.isFinite(o.heading)) heading = o.heading;
      else if (haversine(posRef.current, shown) > 3) heading = bearing(posRef.current, shown);
      else if (onRoute) heading = pointAt(m.pi, snap.along).heading;
      headingRef.current = heading;
      posRef.current = shown;

      const pr = computeProgress(m, snap.along);
      progressRef.current = pr;
      setProgress(pr);

      // ── map
      const g = gRef.current;
      const map = mapRef.current;
      if (g && map) {
        if (!puckRef.current) {
          puckRef.current = createHtmlMarker(g, shown, puckHtml(), undefined, 'center');
          puckRef.current.setMap(map);
        }
        puckRef.current.setPosition(shown);
        const svg = puckRef.current.element()?.querySelector('svg') as SVGElement | null;
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
        setStatusBoth('arrived');
        speak('لقد وصلت إلى وجهتك', mutedRef.current);
        return;
      }

      // ── off-route: three fixes in a row away from the road => plan again from here
      offCountRef.current = snap.dist > limit ? offCountRef.current + 1 : 0;
      if (offCountRef.current >= 3 && Date.now() - lastRerouteRef.current > 8000) {
        void reroute(raw);
        return;
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

      // ── warn once about congestion ahead
      if (mode === 'driving') {
        const ta = trafficAhead(m, snap.along, 1500);
        if (ta && !ta.inside) {
          const key = `t:${Math.round(ta.start / 50)}`;
          if (!ann.has(key)) {
            ann.add(key);
            speak(`ازدحام مروري ${ta.speed === 'TRAFFIC_JAM' ? 'شديد ' : ''}أمامك بعد ${speakDistance(ta.startsIn)}`, mutedRef.current);
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, destination.label],
  );
  handlePosRef.current = handlePosition;

  // ── the position source: the device's GPS, nothing else
  useEffect(() => {
    if (!mapReady || status === 'arrived') return;
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      setGpsError('الملاحة تحتاج اتصالاً آمناً (HTTPS) ودعم تحديد الموقع في المتصفح.');
      return;
    }
    setGpsError('');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsNote('');
        const { latitude, longitude, heading, speed, accuracy } = pos.coords;
        handlePosRef.current(
          { lat: latitude, lng: longitude },
          { heading: speed != null && speed > 1 && heading != null ? heading : null, accuracy, speed },
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGpsError('تم رفض إذن الموقع. فعّله لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة.');
        else if (err.code === err.POSITION_UNAVAILABLE) setGpsError('تعذّر تحديد موقعك. تأكد من تفعيل GPS ثم أعد المحاولة.');
        else setGpsNote('إشارة GPS ضعيفة… ما زلنا نحاول.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [mapReady, status === 'arrived', gpsTry]); // eslint-disable-line react-hooks/exhaustive-deps

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
    bounds.extend(posRef.current);
    modelRef.current.pi.path.slice(Math.max(0, hintRef.current)).forEach((p) => bounds.extend(p));
    if (headingUpRef.current) {
      map.setHeading(0);
      map.setTilt(0);
    }
    map.fitBounds(bounds, { top: 230, right: 40, bottom: 120, left: 40 });
  };

  const acceptSuggestion = () => {
    if (!suggest) return;
    swapModel(suggest.model);
    setSuggest(null);
    speak('تم التحويل إلى مسار أسرع', mutedRef.current);
  };
  const dismissSuggestion = () => {
    snoozeUntilRef.current = Date.now() + SUGGESTION_SNOOZE_MS;
    setSuggest(null);
  };

  const runArrivalAction = async () => {
    if (!arrivalAction) return;
    setActionState('busy');
    try {
      await arrivalAction.run();
      setActionState('done');
    } catch {
      setActionState('error');
    }
  };

  const runSecondary = async () => {
    if (!secondaryAction) return;
    setSecondaryBusy(true);
    try {
      const msg = await secondaryAction.run();
      setSecondaryNote(typeof msg === 'string' ? msg : '✓ تم');
    } catch (e) {
      setSecondaryNote(e instanceof Error ? e.message : 'تعذّر التنفيذ');
    } finally {
      setSecondaryBusy(false);
    }
  };

  // ── derived UI values
  const up = upcomingManeuver(model, progress.stepIndex, destination.label);
  const atStart = alongRef.current < 15 && progress.stepIndex === 0 && !up.isArrival;
  const afterNext = model.route.steps[progress.stepIndex + 2];
  const bannerManeuver = atStart ? model.route.steps[0]?.maneuver ?? 'DEPART' : up.maneuver;
  const bannerText = atStart ? model.route.steps[0]?.instruction || up.instruction : up.instruction;
  const currentRoad = !atStart && progress.stepIndex > 0 ? model.route.steps[progress.stepIndex]?.instruction : '';
  const ta = mode === 'driving' && status === 'navigating' ? trafficAhead(model, alongRef.current, 20000) : null;
  const locating = status === 'locating';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900 text-white" dir="rtl">
      <div ref={mapDiv} className="absolute inset-0" />

      {mapError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center">
          <p className="font-semibold">تعذّر تحميل الخريطة: {mapError}</p>
          <button onClick={onExit} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">رجوع</button>
        </div>
      )}

      {/* ───── Waiting for the real position ───── */}
      {locating && !mapError && (
        <div className="absolute inset-x-0 top-1/3 z-20 mx-auto w-[min(92%,24rem)] rounded-3xl bg-white p-5 text-center text-slate-900 shadow-2xl" data-testid="nav-locating">
          {gpsError ? (
            <>
              <div className="text-4xl">📍</div>
              <p className="mt-2 text-sm font-semibold leading-relaxed">{gpsError}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setGpsTry((n) => n + 1)} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white" data-testid="nav-gps-retry">
                  إعادة المحاولة
                </button>
                <button onClick={onExit} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold">
                  رجوع
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="mt-3 text-sm font-bold">جارٍ تحديد موقعك…</p>
              <p className="mt-1 text-xs text-slate-500">{gpsNote || 'ستبدأ الملاحة من موقعك الفعلي عند التقاط الإشارة.'}</p>
            </>
          )}
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
                {atStart ? 'انطلق' : formatDistance(progress.distToManeuver)}
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

        {/* Where I am and what is ahead */}
        {currentRoad && (
          <div className="truncate rounded-xl bg-slate-800/90 px-3 py-1.5 text-xs shadow-lg" data-testid="nav-road">
            <span className="text-white/60">الآن: </span>
            {currentRoad}
          </div>
        )}
        {mode === 'driving' && status === 'navigating' && (
          <div
            className={`rounded-xl px-3 py-2 text-xs font-bold shadow-lg ${
              ta ? (ta.speed === 'TRAFFIC_JAM' ? 'bg-red-600' : 'bg-amber-500') : 'bg-emerald-700/95'
            }`}
            data-testid="nav-traffic"
          >
            {ta
              ? ta.inside
                ? `🚦 أنت داخل ازدحام ${ta.speed === 'TRAFFIC_JAM' ? 'شديد' : 'متوسط'} — يمتد ${formatDistance(ta.length)} أمامك`
                : `🚦 ازدحام ${ta.speed === 'TRAFFIC_JAM' ? 'شديد' : 'متوسط'} بعد ${formatDistance(ta.startsIn)} — يمتد ${formatDistance(ta.length)}`
              : '✅ لا ازدحام على المسار القريب'}
          </div>
        )}

        {suggest && (
          <div className="rounded-xl bg-white p-3 text-slate-900 shadow-2xl" data-testid="nav-suggest">
            <p className="text-sm font-black">⚡ مسار أسرع متاح</p>
            <p className="mt-0.5 text-xs text-slate-600">يوفّر نحو {formatDuration(suggest.savedSec)} حسب حركة المرور الآن.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={acceptSuggestion} className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white" data-testid="nav-suggest-accept">
                تحويل
              </button>
              <button onClick={dismissSuggestion} className="flex-1 rounded-lg bg-slate-100 py-2 text-xs font-bold">
                تجاهل
              </button>
            </div>
          </div>
        )}
        {status === 'rerouting' && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-lg" data-testid="nav-rerouting">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {locating ? 'جارٍ حساب المسار من موقعك…' : 'جارٍ إعادة حساب المسار…'}
          </div>
        )}
        {rerouteErr && status !== 'rerouting' && (
          <div className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold shadow-lg">تعذّر إعادة حساب المسار، سنحاول مجدداً عند الحاجة.</div>
        )}
        {gpsNote && !locating && <div className="rounded-xl bg-slate-800/95 px-3 py-2 text-xs shadow-lg">{gpsNote}</div>}
      </div>

      {/* ───── Speed ───── */}
      {speedKmh != null && status !== 'arrived' && (
        <div className="absolute bottom-28 start-3 z-10 grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-slate-900/90 text-center shadow-2xl" data-testid="nav-speed">
          <div>
            <div className="text-xl font-black leading-none">{speedKmh}</div>
            <div className="mt-0.5 text-[9px] text-white/70">كم/س</div>
          </div>
        </div>
      )}

      {/* ───── Re-center / overview ───── */}
      {status !== 'arrived' && (
        <div className="absolute bottom-28 end-3 z-10 flex flex-col items-end gap-2">
          <button onClick={overview} className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-2xl active:scale-95" data-testid="nav-overview">
            🗺️ نظرة عامة
          </button>
          {!follow && (
            <button onClick={recenter} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-blue-600 shadow-2xl active:scale-95" data-testid="nav-recenter">
              🎯 إعادة التركيز
            </button>
          )}
        </div>
      )}

      {/* ───── Bottom bar ───── */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-white text-slate-900 shadow-[0_-6px_24px_rgba(0,0,0,.25)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={onExit} className="shrink-0 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white shadow active:scale-95" data-testid="nav-exit">
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
          <button onClick={toggleMute} title={muted ? 'تشغيل الصوت' : 'كتم الصوت'} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-lg active:scale-95">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* ───── Arrived ───── */}
      {status === 'arrived' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/50 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl" data-testid="nav-arrived">
            <div className="text-5xl">🏁</div>
            <h2 className="mt-2 text-xl font-black">وصلت إلى وجهتك</h2>
            <p className="mt-1 text-sm text-slate-600">{destination.label}</p>
            {arrivalAction && actionState !== 'done' && (
              <button
                onClick={runArrivalAction}
                disabled={actionState === 'busy'}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-60"
                data-testid="nav-arrival-action"
              >
                {actionState === 'busy' ? 'جارٍ التحديث…' : arrivalAction.label}
              </button>
            )}
            {secondaryAction && (
              <>
                <button
                  onClick={runSecondary}
                  disabled={secondaryBusy}
                  className="mt-3 w-full rounded-xl border border-emerald-600 py-3 text-sm font-bold text-emerald-700 disabled:opacity-60"
                  data-testid="nav-secondary-action"
                >
                  {secondaryBusy ? '…' : secondaryAction.label}
                </button>
                {secondaryNote && <p className="mt-2 text-xs font-semibold text-slate-600" data-testid="nav-secondary-note">{secondaryNote}</p>}
              </>
            )}
            {actionState === 'done' && <p className="mt-4 text-sm font-bold text-emerald-700" data-testid="nav-action-done">✓ تم تحديث حالة الرحلة</p>}
            {actionState === 'error' && <p className="mt-3 text-xs font-bold text-red-600">تعذّر تحديث الحالة، حاول مرة أخرى.</p>}
            <button onClick={onExit} className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white" data-testid="nav-arrived-close">
              {actionState === 'done' || !arrivalAction ? 'تم' : 'إغلاق'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
