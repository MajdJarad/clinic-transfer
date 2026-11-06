/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useMapConfig } from '../config';
import {
  createHtmlMarker,
  DEFAULT_DESTINATION,
  DEFAULT_ORIGIN,
  ISTANBUL_CENTER,
  loadGoogleMaps,
  pinHtml,
} from '../lib/googleMaps';

// Google Maps base map types
const MAP_TYPES = {
  roadmap: { name: 'خريطة شوارع' },
  satellite: { name: 'قمر صناعي (Satellite)' },
  terrain: { name: 'تضاريس (Terrain)' },
};

type MapTypeKey = keyof typeof MAP_TYPES;

export function MapPage() {
  const mapConfig = useMapConfig();
  const [searchParams] = useSearchParams();

  // Waypoints State
  const [origin, setOrigin] = useState<string>(() => searchParams.get('origin') || DEFAULT_ORIGIN.label);
  const [destination, setDestination] = useState<string>(() => searchParams.get('destination') || DEFAULT_DESTINATION.label);
  const [origCoords, setOrigCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = searchParams.get('origLat');
    const lng = searchParams.get('origLng');
    return lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : DEFAULT_ORIGIN.coord;
  });
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = searchParams.get('destLat');
    const lng = searchParams.get('destLng');
    return lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : DEFAULT_DESTINATION.coord;
  });

  // Transfer Meta info (when launched from a Calendar Trip)
  const patientName = searchParams.get('patient') || '';
  const patientPhone = searchParams.get('phone') || '';
  const driverName = searchParams.get('driver') || '';

  // Navigation State
  const [travelMode, setTravelMode] = useState<'driving' | 'walking' | 'bicycling'>('driving');
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [activeLayer, setActiveLayer] = useState<MapTypeKey>('roadmap');
  const [showTraffic, setShowTraffic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Autocomplete / Search suggestions
  const [searchingField, setSearchingField] = useState<'origin' | 'destination' | null>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);

  // Map Refs
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Sync state if searchParams change
  useEffect(() => {
    const orig = searchParams.get('origin');
    const dest = searchParams.get('destination');
    const oLat = searchParams.get('origLat');
    const oLng = searchParams.get('origLng');
    const dLat = searchParams.get('destLat');
    const dLng = searchParams.get('destLng');

    if (orig) setOrigin(orig);
    if (dest) setDestination(dest);
    if (oLat && oLng) setOrigCoords({ lat: parseFloat(oLat), lng: parseFloat(oLng) });
    if (dLat && dLng) setDestCoords({ lat: parseFloat(dLat), lng: parseFloat(dLng) });
  }, [searchParams]);

  // Load the Google Maps script
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

  // Initialise the Google map (custom controls are rendered below, so the default UI is off)
  useEffect(() => {
    if (!ready || !mapDivRef.current || mapRef.current) return;
    const g = gRef.current;
    mapRef.current = new g.maps.Map(mapDivRef.current, {
      center: origCoords ?? mapConfig.defaultCenter ?? ISTANBUL_CENTER,
      zoom: 12,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Base map type (roadmap / satellite / terrain)
  useEffect(() => {
    mapRef.current?.setMapTypeId(activeLayer);
  }, [ready, activeLayer]);

  // Google live traffic layer
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

  // Draw route & waypoint pins. Everything added here is removed in the cleanup.
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || !origCoords || !destCoords) return;

    let cancelled = false;
    const overlays: any[] = [];
    setCalculating(true);

    // Start pin (green A)
    const pinA = createHtmlMarker(g, origCoords, pinHtml('#137333', origin || 'نقطة الانطلاق', 'A'));
    // Destination pin (red B)
    const pinB = createHtmlMarker(g, destCoords, pinHtml('#d93025', destination || 'الوجهة', 'B'));
    pinA.setMap(map);
    pinB.setMap(map);
    overlays.push(pinA, pinB);

    const fitTo = (path: { lat: number; lng: number }[], padding: number) => {
      const bounds = new g.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      // On phones the directions card covers the top of the map: leave room for it.
      const top = window.innerWidth < 640 ? 300 : padding;
      map.fitBounds(bounds, { top, right: padding, bottom: padding, left: padding });
    };

    // Real route from the server (Google Routes API)
    api.geo
      .route(origCoords, destCoords, travelMode === 'bicycling' ? 'driving' : travelMode)
      .then((res) => {
        if (cancelled || !res.geometry?.coordinates) return;
        const path = res.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));

        // Darker outer casing + signature blue line
        overlays.push(
          new g.maps.Polyline({ path, strokeColor: '#1557bf', strokeOpacity: 0.9, strokeWeight: 8, map }),
        );
        const line = new g.maps.Polyline({ path, strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 5, map });
        overlays.push(line);
        routeRef.current = line;
        fitTo(path, 100);

        setRouteInfo({
          distance: Math.round((res.distance / 1000) * 10) / 10,
          duration: Math.round(res.duration / 60),
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: dashed straight line + estimated distance
        const path = [origCoords, destCoords];
        const line = new g.maps.Polyline({
          path,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#1a73e8', scale: 3 },
              offset: '0',
              repeat: '14px',
            },
          ],
          map,
        });
        overlays.push(line);
        routeRef.current = line;
        fitTo(path, 100);

        const R = 6371;
        const dLat = ((destCoords.lat - origCoords.lat) * Math.PI) / 180;
        const dLon = ((destCoords.lng - origCoords.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((origCoords.lat * Math.PI) / 180) *
            Math.cos((destCoords.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setRouteInfo({
          distance: Math.round(d * 10) / 10,
          duration: Math.max(Math.round(d * 1.6), 5),
        });
      })
      .finally(() => {
        if (!cancelled) setCalculating(false);
      });

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      routeRef.current = null;
    };
  }, [ready, origCoords, destCoords, origin, destination, travelMode]);

  // Swap Origin and Destination
  const swapWaypoints = () => {
    setOrigin(destination);
    setDestination(origin);
    const tempCoords = origCoords;
    setOrigCoords(destCoords);
    setDestCoords(tempCoords);
  };

  // Launch official Google Maps Navigation in 1 click
  const launchGoogleMaps = () => {
    const o = origCoords ? `${origCoords.lat},${origCoords.lng}` : encodeURIComponent(origin);
    const d = destCoords ? `${destCoords.lat},${destCoords.lng}` : encodeURIComponent(destination);
    const mode = travelMode === 'walking' ? 'walking' : travelMode === 'bicycling' ? 'bicycling' : 'driving';
    const url = `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${mode}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Search Address on change
  const handleAddressSearch = async (val: string, field: 'origin' | 'destination') => {
    if (field === 'origin') setOrigin(val);
    else setDestination(val);

    if (val.length >= 3) {
      setSearchingField(field);
      try {
        const results = await api.geo.search(val, 5);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
      setSearchingField(null);
    }
  };

  const selectSuggestion = (s: { label: string; lat: number; lng: number }) => {
    if (searchingField === 'origin') {
      setOrigin(s.label);
      setOrigCoords({ lat: s.lat, lng: s.lng });
    } else if (searchingField === 'destination') {
      setDestination(s.label);
      setDestCoords({ lat: s.lat, lng: s.lng });
    }
    setSuggestions([]);
    setSearchingField(null);
  };

  const recenterRoute = () => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!g || !map || !routeRef.current) return;
    const bounds = new g.maps.LatLngBounds();
    routeRef.current.getPath().forEach((p: any) => bounds.extend(p));
    map.fitBounds(bounds, 80);
  };

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (map) map.setZoom((map.getZoom() ?? 12) + delta);
  };

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
          <p className="font-medium text-fg">
            {loadError ? `تعذّر تحميل خريطة Google: ${loadError}` : 'خريطة Google غير مفعّلة بعد'}
          </p>
          {!mapConfig.googleMapsApiKey && <p>أضف مفتاح Google Maps في GOOGLE_MAPS_API_KEY على السيرفر ليظهر المسار.</p>}
        </div>
      )}

      {/* ─── Google Maps Style Floating Directions Widget ─── */}
      <div className="absolute top-2.5 inset-x-2 sm:inset-x-auto sm:top-4 sm:start-4 z-30 sm:w-80 md:w-96 flex flex-col gap-2 max-w-full">
        {/* Main Directions Box */}
        <div className="rounded-2xl bg-surface/95 p-3 sm:p-4 text-fg shadow-2xl backdrop-blur-md border border-border transition-all">
          {/* Header Title with Minimize Button */}
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-xs shadow-sm">
                🧭
              </span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-fg truncate">ملاحة المسار (Google Maps)</h2>
                <p className="text-[10px] sm:text-[11px] text-muted truncate">تحديد الاتجاهات ومسار النقل</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Travel Mode Pills */}
              <div className="flex rounded-lg bg-surface2 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTravelMode('driving')}
                  title="سيارة"
                  className={`rounded-md p-1 sm:p-1.5 transition text-xs ${
                    travelMode === 'driving' ? 'bg-blue-600 text-white shadow' : 'text-muted hover:text-fg'
                  }`}
                >
                  🚗
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('walking')}
                  title="مشي"
                  className={`rounded-md p-1 sm:p-1.5 transition text-xs ${
                    travelMode === 'walking' ? 'bg-blue-600 text-white shadow' : 'text-muted hover:text-fg'
                  }`}
                >
                  🚶
                </button>
              </div>

              {/* Minimize/Expand Toggle Button */}
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

          {/* When Minimized: Compact 1-line Summary */}
          {isMinimized ? (
            <div className="pt-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex items-center gap-1 text-muted text-[11px] truncate">
                <span className="truncate text-fg font-medium">{origin || 'الانطلاق'}</span>
                <span>➔</span>
                <span className="truncate text-fg font-medium">{destination || 'الوجهة'}</span>
                {routeInfo && (
                  <span className="text-blue-600 font-bold shrink-0 font-mono">
                    ({routeInfo.duration} د)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={launchGoogleMaps}
                className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-blue-700 flex items-center gap-1"
              >
                <span>🧭</span>
                <span>انطلاق</span>
              </button>
            </div>
          ) : (
            <>
              {/* Waypoints Input Form */}
              <div className="relative space-y-1.5 mt-2.5">
                {/* Waypoint A (Origin) */}
                <div className="flex items-center gap-2 rounded-xl bg-surface2 px-2.5 py-1.5 border border-border focus-within:border-blue-500 transition">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                    A
                  </span>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => handleAddressSearch(e.target.value, 'origin')}
                    placeholder="اختر نقطة الانطلاق..."
                    className="w-full bg-transparent text-xs text-fg placeholder-muted focus:outline-none"
                  />
                  {origin && (
                    <button onClick={() => setOrigin('')} className="text-xs text-muted hover:text-fg p-0.5">
                      ✕
                    </button>
                  )}
                </div>

                {/* Swap Button */}
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

                {/* Waypoint B (Destination) */}
                <div className="flex items-center gap-2 rounded-xl bg-surface2 px-2.5 py-1.5 border border-border focus-within:border-blue-500 transition">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-white font-bold text-[10px]">
                    B
                  </span>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => handleAddressSearch(e.target.value, 'destination')}
                    placeholder="اختر نقطة الوجهة..."
                    className="w-full bg-transparent text-xs text-fg placeholder-muted focus:outline-none"
                  />
                  {destination && (
                    <button onClick={() => setDestination('')} className="text-xs text-muted hover:text-fg p-0.5">
                      ✕
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {suggestions.length > 0 && searchingField && (
                  <div className="absolute top-full start-0 end-0 z-50 mt-1 max-h-44 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl text-xs">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectSuggestion(s)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-fg hover:bg-surface2 transition"
                      >
                        <span className="shrink-0">📍</span>
                        <span className="truncate text-xs">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Trip Context Chip */}
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

              {/* Route Info & Big Google Navigation Button */}
              <div className="mt-3 border-t border-border/80 pt-2.5 space-y-2.5">
                {calculating ? (
                  <div className="py-1 text-center text-xs text-muted animate-pulse">
                    جارٍ حساب المسار الأمثل...
                  </div>
                ) : routeInfo ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-blue-600">
                        {routeInfo.duration} دقيقة
                      </div>
                      <div className="text-[11px] sm:text-xs text-muted mt-0.5">
                        {routeInfo.distance} كم • أسرع مسار حالياً
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 font-bold text-[10px] sm:text-xs">
                      أسرع مسار ✓
                    </div>
                  </div>
                ) : null}

                {/* Launch Google Maps Navigation Button */}
                <button
                  type="button"
                  onClick={launchGoogleMaps}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99]"
                >
                  <span className="text-sm">🧭</span>
                  <span>انطلاق للملاحة في خرائط Google</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Floating Map Controls (Google Style, repositioned to bottom-corner on Mobile to avoid any overlap) ─── */}
      <div className="absolute bottom-6 end-3 sm:bottom-auto sm:top-4 sm:end-4 z-30 flex flex-col gap-2 items-end">
        {/* Layer Switcher (Popover on Mobile / Clean List on Desktop) */}
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

          {/* Layer Options Dropdown Menu */}
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
                    activeLayer === layerKey
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-fg hover:bg-surface2'
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

        {/* Recenter & Fullscreen buttons */}
        <div className="flex flex-col rounded-xl bg-surface/95 shadow-xl backdrop-blur-md border border-border">
          <button
            type="button"
            onClick={recenterRoute}
            title="تركيز المسار على الشاشة"
            className="h-9 w-9 p-2 text-muted hover:text-fg border-b border-border transition text-sm flex items-center justify-center"
          >
            🎯
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
            className="h-9 w-9 p-2 text-muted hover:text-fg transition text-sm flex items-center justify-center"
          >
            {isFullscreen ? '🗗' : '⛶'}
          </button>
        </div>

        {/* Zoom Controls (+ / -) - visible on tablet & desktop */}
        <div className="hidden sm:flex flex-col rounded-xl bg-surface/95 shadow-xl backdrop-blur-md border border-border">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            className="h-9 w-9 p-2 text-base font-bold text-muted hover:text-fg border-b border-border transition flex items-center justify-center"
            title="تكبير"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            className="h-9 w-9 p-2 text-base font-bold text-muted hover:text-fg transition flex items-center justify-center"
            title="تصغير"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
