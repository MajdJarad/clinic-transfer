/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useMapConfig } from '../config';
import { ManeuverIcon } from '../features/map/ManeuverIcon';
import { NavigationScreen } from '../features/map/NavigationScreen';
import { PlaceInput } from '../features/map/PlaceInput';
import {
  createHtmlMarker,
  DEFAULT_DESTINATION,
  DEFAULT_ORIGIN,
  ISTANBUL_CENTER,
  loadGoogleMaps,
  pinHtml,
} from '../features/map/googleMaps';
import { formatDistance, formatDuration, type LatLng, type RouteData } from '../features/map/routeNav';
import { useRoutes } from '../features/map/useRoutes';
import { useWaypoints, type Place } from '../features/map/useWaypoints';

// Google Maps base map types
const MAP_TYPES = {
  roadmap: { name: 'خريطة شوارع' },
  satellite: { name: 'قمر صناعي (Satellite)' },
  terrain: { name: 'تضاريس (Terrain)' },
};
type MapTypeKey = keyof typeof MAP_TYPES;

const toPath = (r: RouteData): LatLng[] => r.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));

export function MapPage() {
  const mapConfig = useMapConfig();
  const [searchParams] = useSearchParams();

  // ── Waypoints (typed text, chosen suggestion, "my location", swap)
  const wp = useWaypoints(
    {
      label: searchParams.get('origin') || DEFAULT_ORIGIN.label,
      coord: searchParams.get('origLat') && searchParams.get('origLng')
        ? { lat: parseFloat(searchParams.get('origLat')!), lng: parseFloat(searchParams.get('origLng')!) }
        : DEFAULT_ORIGIN.coord,
    },
    {
      label: searchParams.get('destination') || DEFAULT_DESTINATION.label,
      coord: searchParams.get('destLat') && searchParams.get('destLng')
        ? { lat: parseFloat(searchParams.get('destLat')!), lng: parseFloat(searchParams.get('destLng')!) }
        : DEFAULT_DESTINATION.coord,
    },
  );
  const { from, to, fromText, toText, fromIsGps, fromDirty, toDirty, geoMsg, setGeoMsg } = wp;

  // Transfer meta info (when launched from a calendar trip)
  const patientName = searchParams.get('patient') || '';
  const patientPhone = searchParams.get('phone') || '';
  const driverName = searchParams.get('driver') || '';

  // ── Routes (alternatives, steps and traffic come from the server)
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving');
  const [avoid, setAvoid] = useState({ tolls: false, highways: false, ferries: false });
  const [showAvoid, setShowAvoid] = useState(false);
  const [selected, setSelected] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const {
    routes,
    loading: calculating,
    error: routeError,
    retryable,
    retry,
  } = useRoutes(from.coord, to.coord, {
    mode: travelMode,
    avoidTolls: avoid.tolls,
    avoidHighways: avoid.highways,
    avoidFerries: avoid.ferries,
  });

  // A point tapped on the map, waiting to be used as origin/destination
  const [picked, setPicked] = useState<{ coord: LatLng; label: string; loading: boolean } | null>(null);
  // The user's own position (blue dot), shown on request
  const [myPos, setMyPos] = useState<{ coord: LatLng; accuracy: number } | null>(null);

  // ── Map UI
  const [activeLayer, setActiveLayer] = useState<MapTypeKey>('roadmap');
  const [showTraffic, setShowTraffic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const onMapClickRef = useRef<(lat: number, lng: number) => void>(() => {});
  const pickSeq = useRef(0);


  // Sync state if searchParams change (opened from a calendar trip). Only touch state when something
  // actually differs, so the initial mount doesn't trigger a second route request.
  useEffect(() => {
    const orig = searchParams.get('origin');
    const dest = searchParams.get('destination');
    const oLat = searchParams.get('origLat');
    const oLng = searchParams.get('origLng');
    const dLat = searchParams.get('destLat');
    const dLng = searchParams.get('destLng');
    const differs = (p: Place, label: string | null, lat: string | null, lng: string | null) =>
      (label != null && label !== p.label) ||
      (lat != null && lng != null && (p.coord?.lat !== parseFloat(lat) || p.coord?.lng !== parseFloat(lng)));
    if (differs(from, orig, oLat, oLng)) {
      const label = orig ?? from.label;
      if (oLat && oLng) wp.setPlace('from', { label, coord: { lat: parseFloat(oLat), lng: parseFloat(oLng) } });
      else void wp.resolve('from', label); // address only (trip saved without coordinates): locate it
    }
    if (differs(to, dest, dLat, dLng)) {
      const label = dest ?? to.label;
      if (dLat && dLng) wp.setPlace('to', { label, coord: { lat: parseFloat(dLat), lng: parseFloat(dLng) } });
      else void wp.resolve('to', label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Load Google Maps
  useEffect(() => {
    if (!mapConfig.googleMapsApiKey) return;
    let cancelled = false;
    loadGoogleMaps(mapConfig.googleMapsApiKey)
      .then((g) => {
        if (cancelled) return;
        gRef.current = g;
        setReady(true);
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [mapConfig.googleMapsApiKey]);

  // ── Init map (custom controls are rendered below, so the default UI is off)
  useEffect(() => {
    if (!ready || !mapDivRef.current || mapRef.current) return;
    const g = gRef.current;
    mapRef.current = new g.maps.Map(mapDivRef.current, {
      center: from.coord ?? mapConfig.defaultCenter ?? ISTANBUL_CENTER,
      zoom: 12,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
    });
    mapRef.current.addListener('click', (e: any) => onMapClickRef.current(e.latLng.lat(), e.latLng.lng()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(activeLayer);
  }, [ready, activeLayer]);

  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    if (showTraffic) {
      if (!trafficRef.current) trafficRef.current = new g.maps.TrafficLayer();
      trafficRef.current.setMap(map);
    } else {
      trafficRef.current?.setMap(null);
    }
  }, [ready, showTraffic]);

  // The map must be told when its container changes size (fullscreen toggle)
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    const id = setTimeout(() => g.maps.event.trigger(map, 'resize'), 50);
    return () => clearTimeout(id);
  }, [isFullscreen, ready]);

  // A new set of routes always starts on the first (fastest) option.
  useEffect(() => {
    setSelected(0);
    setShowSteps(false);
  }, [routes]);

  // ── Waypoint pins
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    const overlays: any[] = [];
    if (from.coord) {
      const a = createHtmlMarker(g, from.coord, pinHtml('#137333', from.label || 'نقطة الانطلاق', 'A'));
      a.setMap(map);
      overlays.push(a);
    }
    if (to.coord) {
      const b = createHtmlMarker(g, to.coord, pinHtml('#d93025', to.label || 'الوجهة', 'B'));
      b.setMap(map);
      overlays.push(b);
    }
    return () => overlays.forEach((o) => o.setMap(null));
  }, [ready, from, to]);

  // ── Marker for the tapped point
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || !picked) return;
    const m = createHtmlMarker(
      g,
      picked.coord,
      `<div style="width:18px;height:18px;border-radius:50%;background:#5f6368;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
      undefined,
      'center',
    );
    m.setMap(map);
    return () => m.setMap(null);
  }, [ready, picked?.coord.lat, picked?.coord.lng]);

  // ── The user's own position: blue dot + accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || !myPos) return;
    const dot = createHtmlMarker(
      g,
      myPos.coord,
      `<div style="width:18px;height:18px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,.25)"></div>`,
      undefined,
      'center',
    );
    dot.setMap(map);
    const circle = new g.maps.Circle({
      center: myPos.coord,
      radius: Math.min(myPos.accuracy, 500),
      strokeOpacity: 0,
      fillColor: '#1a73e8',
      fillOpacity: 0.12,
      map,
    });
    return () => {
      dot.setMap(null);
      circle.setMap(null);
    };
  }, [ready, myPos]);

  // ── Draw route options: alternatives (light, clickable) and the selected one (with traffic colors)
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || !routes.length) return;
    const overlays: any[] = [];
    routes.forEach((r, i) => {
      if (i === selected) return;
      const alt = new g.maps.Polyline({ path: toPath(r), strokeColor: '#8ab4f8', strokeOpacity: 0.95, strokeWeight: 6, zIndex: 1, map });
      alt.addListener('click', () => setSelected(i));
      overlays.push(alt);
    });
    const r = routes[selected];
    if (r) {
      const path = toPath(r);
      overlays.push(new g.maps.Polyline({ path, strokeColor: '#1557bf', strokeOpacity: 0.95, strokeWeight: 9, zIndex: 2, map }));
      overlays.push(new g.maps.Polyline({ path, strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 6, zIndex: 3, map }));
      r.traffic.forEach((t) => {
        overlays.push(
          new g.maps.Polyline({
            path: path.slice(t.from, t.to + 1),
            strokeColor: t.speed === 'TRAFFIC_JAM' ? '#d93025' : '#f9ab00',
            strokeOpacity: 1,
            strokeWeight: 6,
            zIndex: 4,
            map,
          }),
        );
      });
    }
    return () => overlays.forEach((o) => o.setMap(null));
  }, [ready, routes, selected]);

  const fitRoutes = () => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    const bounds = new g.maps.LatLngBounds();
    const list = routes.length ? routes : [];
    list.forEach((r) => toPath(r).forEach((p) => bounds.extend(p)));
    if (!list.length) {
      if (from.coord) bounds.extend(from.coord);
      if (to.coord) bounds.extend(to.coord);
    }
    if (bounds.isEmpty()) return;
    // On phones the directions card covers the top of the map: leave room for it.
    const top = window.innerWidth < 640 ? 320 : 100;
    map.fitBounds(bounds, { top, right: 100, bottom: 100, left: 100 });
  };

  useEffect(() => {
    fitRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routes, from.coord, to.coord]);

  // ── Actions
  // Tap on the map -> address -> offer it as destination / start (like Google Maps)
  onMapClickRef.current = async (lat, lng) => {
    const mine = ++pickSeq.current;
    setPicked({ coord: { lat, lng }, label: '', loading: true });
    try {
      const r = await api.geo.reverse(lat, lng);
      if (mine === pickSeq.current) setPicked({ coord: { lat, lng }, label: r.label, loading: false });
    } catch {
      if (mine === pickSeq.current) setPicked({ coord: { lat, lng }, label: `الموقع المحدد (${lat.toFixed(5)}, ${lng.toFixed(5)})`, loading: false });
    }
  };

  const usePicked = (target: 'from' | 'to') => {
    if (!picked) return;
    wp.setPlace(target, { label: picked.label, coord: picked.coord });
    setPicked(null);
  };

  // Show where I am on the map
  const locateMe = () => {
    setGeoMsg('');
    if (!('geolocation' in navigator)) return setGeoMsg('المتصفح لا يدعم تحديد الموقع');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos({ coord, accuracy: pos.coords.accuracy });
        mapRef.current?.panTo(coord);
        mapRef.current?.setZoom(15);
      },
      (err) => setGeoMsg(err.code === err.PERMISSION_DENIED ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.' : 'تعذّر تحديد موقعك الحالي'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  };

  const route: RouteData | null = routes[selected] ?? null;
  const fastest = routes.reduce((best, r, i) => (r.duration < (routes[best]?.duration ?? Infinity) ? i : best), 0);
  const canStart = !!route && !calculating && !fromDirty && !toDirty && !!from.coord && !!to.coord;
  const startHint = calculating
    ? 'جارٍ حساب المسار…'
    : fromDirty || toDirty
      ? 'اختر الأماكن من قائمة الاقتراحات'
      : !from.coord || !to.coord
        ? 'حدّد نقطة الانطلاق والوجهة'
        : routeError;

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (map) map.setZoom((map.getZoom() ?? 12) + delta);
  };

  const summary = route ? `${formatDuration(route.duration)} (${formatDistance(route.distance)})` : '';

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-slate-900 transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen w-screen' : 'h-[calc(100dvh-10rem)] sm:h-[calc(100vh-6.5rem)]'
      }`}
    >
      {/* ─── Map Canvas ─── */}
      <div ref={mapDivRef} className="h-full w-full z-0" />
      {(!mapConfig.googleMapsApiKey || loadError) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface2 p-6 text-center text-sm text-muted">
          <p className="font-medium text-fg">{loadError ? `تعذّر تحميل خريطة Google: ${loadError}` : 'خريطة Google غير مفعّلة بعد'}</p>
          {!mapConfig.googleMapsApiKey && <p>أضف مفتاح Google Maps في GOOGLE_MAPS_API_KEY على السيرفر ليظهر المسار.</p>}
        </div>
      )}

      {/* ─── Directions card ─── */}
      <div className="absolute top-2.5 inset-x-2 sm:inset-x-auto sm:top-4 sm:start-4 z-30 sm:w-80 md:w-96 flex flex-col gap-2 max-w-full">
        <div className="rounded-2xl bg-surface/95 p-3 sm:p-4 text-fg shadow-2xl backdrop-blur-md border border-border transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-xs shadow-sm">🧭</span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-fg truncate">ملاحة المسار (Google Maps)</h2>
                <p className="text-[10px] sm:text-[11px] text-muted truncate">تحديد الاتجاهات ومسار النقل</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex rounded-lg bg-surface2 p-0.5 text-xs">
                {(['driving', 'walking'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTravelMode(m)}
                    title={m === 'driving' ? 'سيارة' : 'مشي'}
                    className={`rounded-md p-1 sm:p-1.5 transition text-xs ${travelMode === m ? 'bg-blue-600 text-white shadow' : 'text-muted hover:text-fg'}`}
                  >
                    {m === 'driving' ? '🚗' : '🚶'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'توسيع البطاقة' : 'تصغير لمشاهدة الخريطة بالكامل'}
                className="grid h-7 w-7 place-items-center rounded-lg bg-surface2 border border-border text-muted hover:text-fg transition text-xs"
              >
                {isMinimized ? '▼' : '▲'}
              </button>
            </div>
          </div>

          {isMinimized ? (
            <div className="pt-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex items-center gap-1 text-muted text-[11px] truncate">
                <span className="truncate text-fg font-medium">{from.label || 'الانطلاق'}</span>
                <span>➔</span>
                <span className="truncate text-fg font-medium">{to.label || 'الوجهة'}</span>
                {route && <span className="text-blue-600 font-bold shrink-0 font-mono">({formatDuration(route.duration)})</span>}
              </div>
              <button
                type="button"
                disabled={!canStart}
                onClick={() => setNavOpen(true)}
                className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                <span>🧭</span>
                <span>انطلق</span>
              </button>
            </div>
          ) : (
            <>
              {/* Waypoint inputs with place search */}
              <div className="relative space-y-1.5 mt-2.5">
                <PlaceInput
                  value={fromText}
                  badge="A"
                  badgeClass="bg-emerald-600"
                  placeholder="اختر نقطة الانطلاق..."
                  unresolved={fromDirty || (!!fromText && !from.coord)}
                  onChange={(t) => wp.setText('from', t)}
                  onPick={(pl) => wp.setPlace('from', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
                  onClear={() => wp.clear('from')}
                  onUseCurrentLocation={() => wp.useMyLocation('from')}
                />
                <div className="flex justify-end pe-3 -my-1 relative z-10">
                  <button
                    type="button"
                    onClick={wp.swap}
                    title="تبديل نقطة الانطلاق والوجهة"
                    className="grid h-6 w-6 place-items-center rounded-full bg-surface border border-border text-muted shadow-sm hover:text-fg hover:border-blue-500 transition active:scale-95 text-xs"
                  >
                    ⇅
                  </button>
                </div>
                <PlaceInput
                  value={toText}
                  badge="B"
                  badgeClass="bg-red-600"
                  placeholder="اختر نقطة الوجهة..."
                  unresolved={toDirty || (!!toText && !to.coord)}
                  onChange={(t) => wp.setText('to', t)}
                  onPick={(pl) => wp.setPlace('to', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
                  onClear={() => wp.clear('to')}
                />
                {geoMsg && <p className="ps-1 text-[11px] text-amber-600">{geoMsg}</p>}
              </div>

              {/* Trip context (from the calendar) */}
              {patientName && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 text-xs">
                  <div className="min-w-0">
                    <p className="text-[10px] text-blue-500 font-semibold">رحلة من التقويم</p>
                    <p className="truncate font-bold text-fg text-xs">المريض: {patientName}</p>
                    {driverName && <p className="text-[10px] text-muted truncate">السائق: {driverName}</p>}
                  </div>
                  {patientPhone && (
                    <a
                      href={`https://wa.me/${patientPhone.replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-700 shrink-0"
                    >
                      واتساب
                    </a>
                  )}
                </div>
              )}

              {/* Route options + start */}
              <div className="mt-3 border-t border-border/80 pt-2.5 space-y-2.5">
                {calculating && <div className="py-1 text-center text-xs text-muted animate-pulse">جارٍ حساب المسار الأمثل...</div>}

                {routeError && !calculating && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-red-500/10 px-2.5 py-2 text-xs text-red-600">
                    <span>{routeError}</span>
                    {retryable && (
                      <button type="button" onClick={retry} className="shrink-0 rounded-lg bg-red-600 px-2 py-1 font-bold text-white">
                        إعادة المحاولة
                      </button>
                    )}
                  </div>
                )}

                {routes.length > 0 && !calculating && (
                  <>
                    <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:flex-col sm:gap-1.5 sm:overflow-visible sm:pb-0" role="radiogroup" aria-label="خيارات المسار">
                      {routes.map((r, i) => {
                        const jam = r.traffic.some((t) => t.speed === 'TRAFFIC_JAM');
                        return (
                          <button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={i === selected}
                            onClick={() => setSelected(i)}
                            data-testid={`route-option-${i}`}
                            className={`flex w-40 shrink-0 snap-start items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-start transition sm:w-full ${
                              i === selected ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-surface2 hover:border-blue-400'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className={`text-lg font-black leading-none ${i === selected ? 'text-blue-600' : 'text-fg'}`}>{formatDuration(r.duration)}</div>
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

                  </>
                )}

                {/* Steps + road preferences share one row (keeps the card short on phones) */}
                {((route && route.steps.length > 0) || travelMode === 'driving') && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    {route && route.steps.length > 0 && !calculating && (
                      <button type="button" onClick={() => setShowSteps((v) => !v)} className="text-[11px] font-semibold text-blue-600 hover:underline" data-testid="steps-toggle">
                        {showSteps ? 'إخفاء الخطوات' : `عرض الخطوات (${route.steps.length})`}
                      </button>
                    )}
                    {travelMode === 'driving' && (
                      <button type="button" onClick={() => setShowAvoid((v) => !v)} className="ms-auto text-[11px] font-semibold text-muted hover:text-fg" data-testid="avoid-toggle">
                        ⚙️ خيارات المسار {avoid.tolls || avoid.highways || avoid.ferries ? '(مفعّلة)' : ''} {showAvoid ? '▲' : '▼'}
                      </button>
                    )}
                    {showSteps && route && (
                      <ol className="basis-full max-h-44 space-y-1 overflow-y-auto pe-1" data-testid="route-steps">
                        {route.steps.map((st, i) => (
                          <li key={i} className="flex items-center gap-2 rounded-lg bg-surface2 px-2 py-1.5 text-[11px]">
                            <ManeuverIcon maneuver={st.maneuver} size={18} className="shrink-0 text-blue-600" />
                            <span className="min-w-0 flex-1 truncate text-fg">{st.instruction}</span>
                            <span className="shrink-0 font-mono text-muted">{formatDistance(st.distance)}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {showAvoid && travelMode === 'driving' && (
                      <div className="basis-full flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
                        {([
                          ['tolls', 'تجنّب الرسوم'],
                          ['highways', 'تجنّب الطرق السريعة'],
                          ['ferries', 'تجنّب العبّارات'],
                        ] as const).map(([k, label]) => (
                          <label key={k} className="flex cursor-pointer items-center gap-1.5 text-fg">
                            <input
                              type="checkbox"
                              checked={avoid[k]}
                              onChange={(e) => setAvoid((a) => ({ ...a, [k]: e.target.checked }))}
                              data-testid={`avoid-${k}`}
                              className="h-3.5 w-3.5 accent-blue-600"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canStart}
                  onClick={() => setNavOpen(true)}
                  data-testid="start-nav"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <span className="text-sm">🧭</span>
                  <span>{canStart ? `${fromIsGps ? 'ابدأ الملاحة' : 'معاينة الرحلة'}${summary ? ` • ${summary}` : ''}` : startHint || 'ابدأ الملاحة'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Floating map controls ─── */}
      <div className="absolute bottom-6 end-3 sm:bottom-auto sm:top-4 sm:end-4 z-30 flex flex-col gap-2 items-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            title="تغيير نوع الخريطة (طبقات)"
            className="flex h-9 w-9 sm:h-auto sm:w-auto items-center justify-center sm:justify-start gap-1.5 rounded-xl bg-surface/95 p-2 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-fg shadow-xl backdrop-blur-md border border-border hover:bg-surface2 transition"
          >
            <span className="text-base sm:text-sm">🗺️</span>
            <span className="hidden sm:inline">{MAP_TYPES[activeLayer].name}</span>
          </button>
          {showLayerMenu && (
            <div className="absolute bottom-full end-0 mb-2 sm:bottom-auto sm:top-full sm:mt-2 w-48 rounded-xl bg-surface p-1 shadow-2xl backdrop-blur-md border border-border flex flex-col gap-0.5 z-40 text-xs">
              {(Object.keys(MAP_TYPES) as MapTypeKey[]).map((layerKey) => (
                <button
                  key={layerKey}
                  onClick={() => {
                    setActiveLayer(layerKey);
                    setShowLayerMenu(false);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium text-start transition ${
                    activeLayer === layerKey ? 'bg-blue-600 text-white font-bold' : 'text-fg hover:bg-surface2'
                  }`}
                >
                  {MAP_TYPES[layerKey].name}
                </button>
              ))}
              {ready && (
                <button
                  onClick={() => {
                    setShowTraffic(!showTraffic);
                    setShowLayerMenu(false);
                  }}
                  className={`mt-1 rounded-lg border-t border-border px-2.5 py-1.5 text-xs font-medium text-start transition ${
                    showTraffic ? 'bg-amber-600 text-white font-bold' : 'text-fg hover:bg-surface2'
                  }`}
                >
                  🚦 حركة المرور
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col rounded-xl bg-surface/95 shadow-xl backdrop-blur-md border border-border">
          <button type="button" onClick={locateMe} title="موقعي الحالي" data-testid="locate-me" className="h-9 w-9 p-2 text-blue-600 hover:text-blue-700 border-b border-border transition text-sm flex items-center justify-center">
            📍
          </button>
          <button type="button" onClick={fitRoutes} title="تركيز المسار على الشاشة" className="h-9 w-9 p-2 text-muted hover:text-fg border-b border-border transition text-sm flex items-center justify-center">
            🎯
          </button>
          <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'تصغير' : 'ملء الشاشة'} className="h-9 w-9 p-2 text-muted hover:text-fg transition text-sm flex items-center justify-center">
            {isFullscreen ? '🗗' : '⛶'}
          </button>
        </div>

        <div className="hidden sm:flex flex-col rounded-xl bg-surface/95 shadow-xl backdrop-blur-md border border-border">
          <button type="button" onClick={() => zoomBy(1)} className="h-9 w-9 p-2 text-base font-bold text-muted hover:text-fg border-b border-border transition flex items-center justify-center" title="تكبير">
            +
          </button>
          <button type="button" onClick={() => zoomBy(-1)} className="h-9 w-9 p-2 text-base font-bold text-muted hover:text-fg transition flex items-center justify-center" title="تصغير">
            −
          </button>
        </div>
      </div>

      {/* ─── Tapped point: use as destination / start ─── */}
      {picked && !navOpen && (
        <div className="absolute bottom-4 inset-x-3 max-sm:me-16 sm:inset-x-0 sm:mx-auto sm:w-96 z-30 rounded-2xl border border-border bg-surface/95 p-3 text-fg shadow-2xl backdrop-blur-md" data-testid="picked-card">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-xs font-semibold leading-snug">
              {picked.loading ? <span className="animate-pulse text-muted">جارٍ تحديد العنوان…</span> : picked.label}
            </p>
            <button type="button" aria-label="إغلاق" onClick={() => setPicked(null)} className="shrink-0 text-xs text-muted hover:text-fg">✕</button>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={picked.loading} onClick={() => usePicked('to')} data-testid="picked-to" className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              اجعلها الوجهة
            </button>
            <button type="button" disabled={picked.loading} onClick={() => usePicked('from')} data-testid="picked-from" className="flex-1 rounded-xl border border-border bg-surface2 py-2 text-xs font-bold text-fg hover:border-blue-400 disabled:opacity-50">
              نقطة الانطلاق
            </button>
          </div>
        </div>
      )}

      {/* ─── In-app turn-by-turn navigation ─── */}
      {navOpen && route && from.coord && to.coord && (
        <NavigationScreen
          origin={{ label: from.label, coord: from.coord }}
          destination={{ label: to.label, coord: to.coord }}
          mode={travelMode}
          route={route}
          startWithGps={fromIsGps}
          avoid={avoid}
          onExit={() => setNavOpen(false)}
        />
      )}
    </div>
  );
}
