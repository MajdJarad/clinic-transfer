/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { useMapConfig } from '../../config';
import {
  createHtmlMarker,
  escapeHtml,
  ISTANBUL_CENTER,
  loadGoogleMaps,
  pinHtml,
  type HtmlMarker,
} from './googleMaps';

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
  fit?: boolean;
}

export function MapView({
  points,
  route = null,
  routeLatLng = false,
  height = 360,
  center,
  zoom,
  fit = true,
}: MapViewProps) {
  const { t, dir } = useI18n();
  const { googleMapsApiKey } = useMapConfig();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null);
  const markersRef = useRef<HtmlMarker[]>([]);
  const routeRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [showTraffic, setShowTraffic] = useState(false);

  // Load the Google Maps script.
  useEffect(() => {
    if (!googleMapsApiKey) return;
    let cancelled = false;
    loadGoogleMaps(googleMapsApiKey)
      .then((g) => {
        if (cancelled) return;
        gRef.current = g;
        setReady(true);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [googleMapsApiKey]);

  // Initialise the map once.
  useEffect(() => {
    if (!ready || !divRef.current || mapRef.current) return;
    const g = gRef.current;
    mapRef.current = new g.maps.Map(divRef.current, {
      center: center ?? ISTANBUL_CENTER,
      zoom: zoom ?? 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Markers.
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = points.map((p) => {
      const info = p.subtitle
        ? new g.maps.InfoWindow({
            content: `<b>${escapeHtml(p.title)}</b><br/>${escapeHtml(p.subtitle)}`,
          })
        : null;
      const marker = createHtmlMarker(
        g,
        { lat: p.lat, lng: p.lng },
        pinHtml(p.color ?? '#2563eb', `${p.title}${p.subtitle ? ` - ${p.subtitle}` : ''}`, undefined, dir),
        info
          ? () => {
              info.setPosition({ lat: p.lat, lng: p.lng });
              info.open(map);
            }
          : undefined,
      );
      marker.setMap(map);
      return marker;
    });
    if (fit && points.length > 0) {
      if (points.length === 1) {
        map.setCenter({ lat: points[0].lat, lng: points[0].lng });
        map.setZoom(14);
      } else {
        const bounds = new g.maps.LatLngBounds();
        points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds, 50);
      }
    }
  }, [ready, points, dir, fit]);

  // Route polyline.
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    routeRef.current?.setMap(null);
    routeRef.current = null;
    if (route && route.length > 1) {
      const path = route.map((c) => ({
        lat: routeLatLng ? c[0] : c[1],
        lng: routeLatLng ? c[1] : c[0],
      }));
      routeRef.current = new g.maps.Polyline({
        path,
        strokeColor: '#2563eb',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
      });
      const bounds = new g.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 40);
    }
  }, [ready, route, routeLatLng]);

  // Google live traffic layer.
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

  if (!googleMapsApiKey) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface2 p-6 text-center text-sm text-muted"
        style={{ height }}
      >
        <p className="font-medium text-fg">{t('map.notEnabled')}</p>
        <p>{t('map.addKeyHint')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        style={{ height }}
      >
        {t('map.loadError', { msg: error })}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <div ref={divRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() => setShowTraffic((s) => !s)}
        className={`absolute top-3 z-[5] rounded-lg px-3 py-1.5 text-xs font-medium shadow ${
          showTraffic ? 'bg-brand-600 text-white' : 'bg-surface/95 text-fg'
        }`}
        style={{ insetInlineEnd: '0.75rem' }}
      >
        {t('map.traffic')}
      </button>
    </div>
  );
}
