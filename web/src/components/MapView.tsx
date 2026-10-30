import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useI18n } from '../i18n';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  color?: string;
}

interface MapViewProps {
  points: MapPoint[];
  route?: [number, number][] | null; // [lng, lat] pairs (GeoJSON order) or [lat,lng] when `routeLatLng`
  routeLatLng?: boolean;
  height?: number | string;
  center?: { lat: number; lng: number };
  zoom?: number;
  trafficKey?: string;
  fit?: boolean;
}

function pinIcon(point: MapPoint, dir: string) {
  const color = point.color ?? '#2563eb';
  const label = `${point.title}${point.subtitle ? ` - ${point.subtitle}` : ''}`;
  return L.divIcon({
    className: 'transfer-pin',
    html: `<div dir="${dir}" style="transform:translate(-50%,-100%)">
        <div style="display:flex;align-items:center;gap:6px;background:${color};color:#fff;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff">
          <span style="width:6px;height:6px;border-radius:999px;background:#fff;display:inline-block"></span>
          <span>${label}</span>
        </div>
        <div style="width:2px;height:10px;background:${color};margin:0 auto"></div>
      </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function MapView({
  points,
  route = null,
  routeLatLng = false,
  height = 360,
  center,
  zoom,
  trafficKey,
  fit = true,
}: MapViewProps) {
  const { t, dir } = useI18n();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pointsLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);
  const trafficLayer = useRef<L.TileLayer | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);

  // Initialise the map once.
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      center: center ? [center.lat, center.lng] : [41.0082, 28.9784],
      zoom: zoom ?? 11,
      zoomControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    pointsLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers.
  useEffect(() => {
    const map = mapRef.current;
    const layer = pointsLayer.current;
    if (!map || !layer) return;
    layer.clearLayers();
    points.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p, dir) });
      if (p.subtitle) m.bindPopup(`<b>${p.title}</b><br/>${p.subtitle}`);
      layer.addLayer(m);
    });
    if (fit && points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
      else map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [points, dir, fit]);

  // Route polyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayer.current) {
      routeLayer.current.remove();
      routeLayer.current = null;
    }
    if (route && route.length > 1) {
      const latlngs = route.map((c) => (routeLatLng ? [c[0], c[1]] : [c[1], c[0]]) as [number, number]);
      routeLayer.current = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(map);
      map.fitBounds(routeLayer.current.getBounds(), { padding: [40, 40] });
    }
  }, [route, routeLatLng]);

  // TomTom traffic overlay (optional).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trafficLayer.current) {
      trafficLayer.current.remove();
      trafficLayer.current = null;
    }
    if (showTraffic && trafficKey) {
      trafficLayer.current = L.tileLayer(
        `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(trafficKey)}`,
        { opacity: 0.7, maxZoom: 22 },
      ).addTo(map);
    }
  }, [showTraffic, trafficKey]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <div ref={divRef} className="h-full w-full" />
      {trafficKey && (
        <button
          type="button"
          onClick={() => setShowTraffic((s) => !s)}
          className={`absolute top-3 z-[1000] rounded-lg px-3 py-1.5 text-xs font-medium shadow ${
            showTraffic ? 'bg-brand-600 text-white' : 'bg-surface/95 text-fg'
          }`}
          style={{ insetInlineEnd: '0.75rem' }}
        >
          {t('map.traffic')}
        </button>
      )}
    </div>
  );
}
