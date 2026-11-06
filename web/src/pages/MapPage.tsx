/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useMapConfig } from '../config';
import { ManeuverIcon } from '../components/ManeuverIcon';
import { NavigationScreen } from '../components/NavigationScreen';
import { PlaceInput } from '../components/PlaceInput';
import {
  createHtmlMarker,
  DEFAULT_DESTINATION,
  DEFAULT_ORIGIN,
  ISTANBUL_CENTER,
  loadGoogleMaps,
  pinHtml,
} from '../lib/googleMaps';
import { formatDistance, formatDuration, haversine, type LatLng, type RouteData } from '../lib/routeNav';

// Google Maps base map types
const MAP_TYPES = {
  roadmap: { name: 'خريطة شوارع' },
  satellite: { name: 'قمر صناعي (Satellite)' },
  terrain: { name: 'تضاريس (Terrain)' },
};
type MapTypeKey = keyof typeof MAP_TYPES;

interface Place {
  label: string;
  coord: LatLng | null;
}

const toPath = (r: RouteData): LatLng[] => r.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));

export function MapPage() {
  const mapConfig = useMapConfig();
  const [searchParams] = useSearchParams();

  // ── Waypoints. `from`/`to` are the resolved places; `*Text` is what is typed in the box.
  const [from, setFrom] = useState<Place>(() => {
    const lat = searchParams.get('origLat');
    const lng = searchParams.get('origLng');
    return {
      label: searchParams.get('origin') || DEFAULT_ORIGIN.label,
      coord: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : DEFAULT_ORIGIN.coord,
    };
  });
  const [to, setTo] = useState<Place>(() => {
    const lat = searchParams.get('destLat');
    const lng = searchParams.get('destLng');
    return {
      label: searchParams.get('destination') || DEFAULT_DESTINATION.label,
      coord: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : DEFAULT_DESTINATION.coord,
    };
  });
  const [fromText, setFromText] = useState(from.label);
  const [toText, setToText] = useState(to.label);
  const [fromIsGps, setFromIsGps] = useState(false);
  const [toIsGps, setToIsGps] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');

  // Transfer meta info (when launched from a calendar trip)
  const patientName = searchParams.get('patient') || '';
  const patientPhone = searchParams.get('phone') || '';
  const driverName = searchParams.get('driver') || '';

  // ── Routes
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving');
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selected, setSelected] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [retry, setRetry] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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

  const route = routes[selected] ?? null;
  const fastest = useMemo(() => routes.reduce((best, r, i) => (r.duration < (routes[best]?.duration ?? Infinity) ? i : best), 0), [routes]);
  const fromDirty = fromText !== from.label;
  const toDirty = toText !== to.label;

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
      const next: Place = { label: orig ?? from.label, coord: oLat && oLng ? { lat: parseFloat(oLat), lng: parseFloat(oLng) } : from.coord };
      setFrom(next);
      setFromText(next.label);
      setFromIsGps(false);
    }
    if (differs(to, dest, dLat, dLng)) {
      const next: Place = { label: dest ?? to.label, coord: dLat && dLng ? { lat: parseFloat(dLat), lng: parseFloat(dLng) } : to.coord };
      setTo(next);
      setToText(next.label);
      setToIsGps(false);
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

  // ── Fetch routes whenever the endpoints or travel mode change
  useEffect(() => {
    setRoutes([]);
    setSelected(0);
    setRouteError('');
    setShowSteps(false);
    if (!from.coord || !to.coord) return;
    if (haversine(from.coord, to.coord) < 20) {
      setRouteError('نقطة الانطلاق والوجهة متطابقتان تقريباً');
      return;
    }
    let cancelled = false;
    setCalculating(true);
    api.geo
      .route(from.coord, to.coord, travelMode, true)
      .then((res) => {
        if (cancelled) return;
        const list = res.routes?.length ? res.routes : [res];
        setRoutes(list);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setRouteError(/No route/i.test(e.message) ? 'لا يوجد مسار بين النقطتين' : 'تعذّر حساب المسار. تحقق من الاتصال وحاول مرة أخرى.');
      })
      .finally(() => !cancelled && setCalculating(false));
    return () => {
      cancelled = true;
    };
  }, [from.coord, to.coord, travelMode, retry]);

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
  const swapWaypoints = () => {
    setFrom(to);
    setTo(from);
    setFromText(to.label);
    setToText(from.label);
    setFromIsGps(toIsGps);
    setToIsGps(fromIsGps);
  };

  const useMyLocation = (target: 'from' | 'to') => {
    setGeoMsg('');
    if (!('geolocation' in navigator)) {
      setGeoMsg('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setGeoMsg('جارٍ تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const place = { label: 'موقعي الحالي', coord: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
        setGeoMsg('');
        if (target === 'from') {
          setFrom(place);
          setFromText(place.label);
          setFromIsGps(true);
        } else {
          setTo(place);
          setToText(place.label);
          setToIsGps(true);
        }
      },
      (err) => setGeoMsg(err.code === err.PERMISSION_DENIED ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.' : 'تعذّر تحديد موقعك الحالي'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  };

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
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen w-screen' : 'h-[calc(100vh-6.5rem)]'
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
                  unresolved={fromDirty}
                  onChange={setFromText}
                  onPick={(pl) => {
                    setFrom({ label: pl.label, coord: { lat: pl.lat, lng: pl.lng } });
                    setFromText(pl.label);
                    setFromIsGps(false);
                  }}
                  onClear={() => {
                    setFrom({ label: '', coord: null });
                    setFromText('');
                    setFromIsGps(false);
                  }}
                  onUseCurrentLocation={() => useMyLocation('from')}
                />
                <div className="flex justify-end pe-3 -my-1 relative z-10">
                  <button
                    type="button"
                    onClick={swapWaypoints}
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
                  unresolved={toDirty}
                  onChange={setToText}
                  onPick={(pl) => {
                    setTo({ label: pl.label, coord: { lat: pl.lat, lng: pl.lng } });
                    setToText(pl.label);
                    setToIsGps(false);
                  }}
                  onClear={() => {
                    setTo({ label: '', coord: null });
                    setToText('');
                    setToIsGps(false);
                  }}
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
                    {!/متطابقتان|لا يوجد/.test(routeError) && (
                      <button type="button" onClick={() => setRetry((n) => n + 1)} className="shrink-0 rounded-lg bg-red-600 px-2 py-1 font-bold text-white">
                        إعادة المحاولة
                      </button>
                    )}
                  </div>
                )}

                {routes.length > 0 && !calculating && (
                  <>
                    <div className="space-y-1.5" role="radiogroup" aria-label="خيارات المسار">
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
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-start transition ${
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

                    {route && route.steps.length > 0 && (
                      <div>
                        <button type="button" onClick={() => setShowSteps((s) => !s)} className="text-[11px] font-semibold text-blue-600 hover:underline">
                          {showSteps ? 'إخفاء الخطوات' : `عرض الخطوات (${route.steps.length})`}
                        </button>
                        {showSteps && (
                          <ol className="mt-1.5 max-h-44 space-y-1 overflow-y-auto pe-1" data-testid="route-steps">
                            {route.steps.map((s, i) => (
                              <li key={i} className="flex items-center gap-2 rounded-lg bg-surface2 px-2 py-1.5 text-[11px]">
                                <ManeuverIcon maneuver={s.maneuver} size={18} className="shrink-0 text-blue-600" />
                                <span className="min-w-0 flex-1 truncate text-fg">{s.instruction}</span>
                                <span className="shrink-0 font-mono text-muted">{formatDistance(s.distance)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </>
                )}

                <button
                  type="button"
                  disabled={!canStart}
                  onClick={() => setNavOpen(true)}
                  data-testid="start-nav"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <span className="text-sm">🧭</span>
                  <span>{canStart ? `ابدأ الملاحة${summary ? ` • ${summary}` : ''}` : startHint || 'ابدأ الملاحة'}</span>
                </button>
                {canStart && !fromIsGps && (
                  <p className="text-center text-[10px] text-muted">
                    نقطة الانطلاق ليست موقعك الحالي، ستبدأ الملاحة كمعاينة للرحلة. اختر «موقعي الحالي» للملاحة المباشرة.
                  </p>
                )}
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

      {/* ─── In-app turn-by-turn navigation ─── */}
      {navOpen && route && from.coord && to.coord && (
        <NavigationScreen
          origin={{ label: from.label, coord: from.coord }}
          destination={{ label: to.label, coord: to.coord }}
          mode={travelMode}
          route={route}
          startWithGps={fromIsGps}
          onExit={() => setNavOpen(false)}
        />
      )}
    </div>
  );
}
