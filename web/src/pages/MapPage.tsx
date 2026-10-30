import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { useMapConfig } from '../config';

// Map Tile Layers
const TILE_LAYERS = {
  streets: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    name: 'خريطة شوارع (Google Style)',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    name: 'قمر صناعي (Satellite)',
    attribution: '&copy; Esri & NASA',
  },
  terrain: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    name: 'تضاريس (Terrain)',
    attribution: '&copy; CARTO',
  },
};

type TileType = keyof typeof TILE_LAYERS;

export function MapPage() {
  const mapConfig = useMapConfig();
  const [searchParams] = useSearchParams();

  // Waypoints State
  const [origin, setOrigin] = useState<string>(() => searchParams.get('origin') || 'مطار الملك خالد الدولي');
  const [destination, setDestination] = useState<string>(() => searchParams.get('destination') || 'عيادة النخبة الطبية');
  const [origCoords, setOrigCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = searchParams.get('origLat');
    const lng = searchParams.get('origLng');
    return lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : { lat: 24.9576, lng: 46.6988 };
  });
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = searchParams.get('destLat');
    const lng = searchParams.get('destLng');
    return lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : { lat: 24.7136, lng: 46.6753 };
  });

  // Transfer Meta info (when launched from a Calendar Trip)
  const patientName = searchParams.get('patient') || '';
  const patientPhone = searchParams.get('phone') || '';
  const driverName = searchParams.get('driver') || '';

  // Navigation State
  const [travelMode, setTravelMode] = useState<'driving' | 'walking' | 'bicycling'>('driving');
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [activeLayer, setActiveLayer] = useState<TileType>('streets');
  const [showTraffic, setShowTraffic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Autocomplete / Search suggestions
  const [searchingField, setSearchingField] = useState<'origin' | 'destination' | null>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);

  // Map Refs
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const trafficRef = useRef<L.TileLayer | null>(null);

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

  // Initialise Leaflet Map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const centerLat = origCoords?.lat ?? mapConfig.defaultCenter.lat ?? 24.7136;
    const centerLng = origCoords?.lng ?? mapConfig.defaultCenter.lng ?? 46.6753;

    const map = L.map(mapDivRef.current, {
      center: [centerLat, centerLng],
      zoom: 12,
      zoomControl: false,
    });

    const tile = L.tileLayer(TILE_LAYERS[activeLayer].url, {
      maxZoom: 19,
      attribution: TILE_LAYERS[activeLayer].attribution,
    }).addTo(map);

    tileRef.current = tile;
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle Layer Changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) tileRef.current.remove();
    tileRef.current = L.tileLayer(TILE_LAYERS[activeLayer].url, {
      maxZoom: 19,
      attribution: TILE_LAYERS[activeLayer].attribution,
    }).addTo(map);
  }, [activeLayer]);

  // Handle Traffic Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trafficRef.current) {
      trafficRef.current.remove();
      trafficRef.current = null;
    }
    if (showTraffic && mapConfig.tomtomApiKey) {
      trafficRef.current = L.tileLayer(
        `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(
          mapConfig.tomtomApiKey
        )}`,
        { opacity: 0.7, maxZoom: 22 }
      ).addTo(map);
    }
  }, [showTraffic, mapConfig.tomtomApiKey]);

  // Draw Route & Google Waypoint Pins
  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    markers.clearLayers();
    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }

    if (!origCoords || !destCoords) return;

    setCalculating(true);

    // Google Maps Start Pin (Green Circle A)
    const pinA = L.divIcon({
      className: 'gmap-pin-origin',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%)">
          <div style="background:#137333;color:#fff;font-weight:bold;font-size:12px;padding:5px 10px;border-radius:20px;box-shadow:0 4px 14px rgba(0,0,0,0.35);border:2px solid #fff;display:flex;align-items:center;gap:6px;white-space:nowrap">
            <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#fff;color:#137333;text-align:center;line-height:18px;font-size:11px;font-weight:900">A</span>
            <span style="font-weight:600">${origin || 'نقطة الانطلاق'}</span>
          </div>
          <div style="width:2px;height:12px;background:#137333"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    // Google Maps Destination Pin (Red Teardrop B)
    const pinB = L.divIcon({
      className: 'gmap-pin-dest',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%)">
          <div style="background:#d93025;color:#fff;font-weight:bold;font-size:12px;padding:5px 10px;border-radius:20px;box-shadow:0 4px 14px rgba(0,0,0,0.35);border:2px solid #fff;display:flex;align-items:center;gap:6px;white-space:nowrap">
            <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#fff;color:#d93025;text-align:center;line-height:18px;font-size:11px;font-weight:900">B</span>
            <span style="font-weight:600">${destination || 'الوجهة'}</span>
          </div>
          <div style="width:2px;height:12px;background:#d93025"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    L.marker([origCoords.lat, origCoords.lng], { icon: pinA }).addTo(markers);
    L.marker([destCoords.lat, destCoords.lng], { icon: pinB }).addTo(markers);

    // Call Real Routing Engine (OSRM / API)
    api.geo
      .route(origCoords, destCoords)
      .then((res) => {
        if (res.geometry?.coordinates) {
          const latlngs = res.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]);

          // Dark outer casing for Google Maps authentic border look
          L.polyline(latlngs, {
            color: '#1557bf',
            weight: 8,
            opacity: 0.9,
          }).addTo(markers);

          // Google Maps signature blue route line
          const polyline = L.polyline(latlngs, {
            color: '#1a73e8',
            weight: 5,
            opacity: 1,
          }).addTo(markers);

          routeRef.current = polyline;
          map.fitBounds(polyline.getBounds(), { padding: [100, 100] });

          setRouteInfo({
            distance: Math.round((res.distance / 1000) * 10) / 10,
            duration: Math.round(res.duration / 60),
          });
        }
      })
      .catch(() => {
        // Fallback line
        const latlngs: [number, number][] = [
          [origCoords.lat, origCoords.lng],
          [destCoords.lat, destCoords.lng],
        ];
        const polyline = L.polyline(latlngs, {
          color: '#1a73e8',
          weight: 5,
          dashArray: '8, 8',
        }).addTo(markers);
        routeRef.current = polyline;
        map.fitBounds(L.latLngBounds(latlngs), { padding: [100, 100] });

        // Estimated math distance
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
      .finally(() => setCalculating(false));
  }, [origCoords, destCoords, origin, destination]);

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
    if (routeRef.current && mapRef.current) {
      mapRef.current.fitBounds(routeRef.current.getBounds(), { padding: [80, 80] });
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-slate-900 transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen w-screen' : 'h-[calc(100vh-6.5rem)]'
      }`}
    >
      {/* ─── Map Canvas ─── */}
      <div ref={mapDivRef} className="h-full w-full z-0 cursor-grab active:cursor-grabbing" />

      {/* ─── Google Maps Style Floating Directions Widget ─── */}
      <div className="absolute top-4 start-4 z-30 w-80 md:w-96 flex flex-col gap-3">
        {/* Main Directions Box */}
        <div className="rounded-2xl bg-surface/95 p-4 text-fg shadow-2xl backdrop-blur-md border border-border">
          {/* Header Title with Google Logo Accent */}
          <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-xs shadow-sm">
                🧭
              </span>
              <div>
                <h2 className="text-sm font-bold text-fg">ملاحة المسار (Google Maps)</h2>
                <p className="text-[11px] text-muted">تحديد الاتجاهات ومسار النقل</p>
              </div>
            </div>
            {/* Travel Mode Pills */}
            <div className="flex rounded-lg bg-surface2 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTravelMode('driving')}
                title="سيارة"
                className={`rounded-md p-1.5 transition ${
                  travelMode === 'driving' ? 'bg-blue-600 text-white shadow' : 'text-muted hover:text-fg'
                }`}
              >
                🚗
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('walking')}
                title="مشي"
                className={`rounded-md p-1.5 transition ${
                  travelMode === 'walking' ? 'bg-blue-600 text-white shadow' : 'text-muted hover:text-fg'
                }`}
              >
                🚶
              </button>
            </div>
          </div>

          {/* Waypoints Input Form */}
          <div className="relative space-y-2">
            {/* Origin Input (A) */}
            <div className="flex items-center gap-2.5 rounded-xl bg-surface2 px-3 py-2 border border-border focus-within:border-blue-500 transition">
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
                <button onClick={() => setOrigin('')} className="text-xs text-muted hover:text-fg">
                  ✕
                </button>
              )}
            </div>

            {/* Swap Button (Floating on the side) */}
            <div className="flex justify-end pe-4 -my-1.5 relative z-10">
              <button
                type="button"
                onClick={swapWaypoints}
                title="تبديل نقطة الانطلاق والوجهة"
                className="grid h-6 w-6 place-items-center rounded-full bg-surface border border-border text-muted shadow hover:text-fg hover:scale-105 transition"
              >
                ⇅
              </button>
            </div>

            {/* Destination Input (B) */}
            <div className="flex items-center gap-2.5 rounded-xl bg-surface2 px-3 py-2 border border-border focus-within:border-blue-500 transition">
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
                <button onClick={() => setDestination('')} className="text-xs text-muted hover:text-fg">
                  ✕
                </button>
              )}
            </div>

            {/* Search Suggestions Dropdown */}
            {suggestions.length > 0 && searchingField && (
              <div className="absolute top-full start-0 end-0 z-40 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl text-xs">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-fg hover:bg-surface2 transition"
                  >
                    <span>📍</span>
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Trip Context Chip (when launched from Calendar) */}
          {patientName && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="text-[10px] text-blue-500 font-semibold">رحلة من التقويم</p>
                <p className="truncate font-bold text-fg">المريض: {patientName}</p>
                {driverName && <p className="text-[10px] text-muted truncate">السائق: {driverName}</p>}
              </div>
              {patientPhone && (
                <a
                  href={`https://wa.me/${patientPhone.replace(/[^\d]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-emerald-700"
                >
                  واتساب
                </a>
              )}
            </div>
          )}

          {/* Route Info & Big Google Navigation Button */}
          <div className="mt-4 border-t border-border/80 pt-3.5 space-y-3">
            {calculating ? (
              <div className="py-2 text-center text-xs text-muted animate-pulse">
                جارٍ حساب المسار الأمثل...
              </div>
            ) : routeInfo ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-blue-600">
                    {routeInfo.duration} دقيقة
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {routeInfo.distance} كم • أسرع مسار حالياً
                  </div>
                </div>
                <div className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600 font-bold text-xs">
                  أسرع مسار ✓
                </div>
              </div>
            ) : null}

            {/* Launch Google Maps Navigation Button */}
            <button
              type="button"
              onClick={launchGoogleMaps}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 hover:shadow-xl active:scale-[0.99]"
            >
              <span className="text-base">🧭</span>
              <span>انطلاق للملاحة في خرائط Google</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Floating Right Map Controls (Google Style) ─── */}
      <div className="absolute top-4 end-4 z-30 flex flex-col gap-2">
        {/* Layer Switcher (Streets / Satellite / Terrain) */}
        <div className="flex flex-col rounded-xl bg-surface/90 shadow-xl backdrop-blur-md border border-border p-1">
          {(Object.keys(TILE_LAYERS) as TileType[]).map((layerKey) => (
            <button
              key={layerKey}
              onClick={() => setActiveLayer(layerKey)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold text-start transition ${
                activeLayer === layerKey
                  ? 'bg-blue-600 text-white'
                  : 'text-muted hover:bg-surface2 hover:text-fg'
              }`}
            >
              {TILE_LAYERS[layerKey].name}
            </button>
          ))}
          {mapConfig.tomtomApiKey && (
            <button
              onClick={() => setShowTraffic(!showTraffic)}
              className={`mt-1 rounded-lg border-t border-border px-2.5 py-1.5 text-xs font-semibold text-start transition ${
                showTraffic ? 'bg-amber-600 text-white' : 'text-muted hover:bg-surface2 hover:text-fg'
              }`}
            >
              🚦 حركة المرور
            </button>
          )}
        </div>

        {/* Recenter & Fullscreen buttons */}
        <div className="flex flex-col rounded-xl bg-surface/90 shadow-xl backdrop-blur-md border border-border">
          <button
            type="button"
            onClick={recenterRoute}
            title="تركيز المسار على الشاشة"
            className="p-2.5 text-muted hover:text-fg border-b border-border transition text-sm flex items-center justify-center"
          >
            🎯
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
            className="p-2.5 text-muted hover:text-fg transition text-sm flex items-center justify-center"
          >
            {isFullscreen ? '🗗' : '⛶'}
          </button>
        </div>

        {/* Zoom Controls (+ / -) */}
        <div className="flex flex-col rounded-xl bg-surface/90 shadow-xl backdrop-blur-md border border-border">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="p-2.5 text-base font-bold text-muted hover:text-fg border-b border-border transition flex items-center justify-center"
            title="تكبير"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="p-2.5 text-base font-bold text-muted hover:text-fg transition flex items-center justify-center"
            title="تصغير"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
