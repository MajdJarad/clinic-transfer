import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

declare global {
  interface Window {
    google?: any;
    __gmapReady?: () => void;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    window.__gmapReady = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gmapReady&language=ar&region=SA`;
    script.async = true;
    script.onerror = () => reject(new Error('failed to load google maps'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  color?: string;
}

interface GoogleMapProps {
  apiKey: string;
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  height?: number;
  zoom?: number;
}

export function GoogleMap({ apiKey, markers, center, height = 360, zoom = 11 }: GoogleMapProps) {
  const { t } = useI18n();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !divRef.current) return;
    const g = window.google;
    const initial = center ?? markers[0] ?? { lat: 24.7136, lng: 46.6753 };
    if (!mapRef.current) {
      mapRef.current = new g.maps.Map(divRef.current, {
        center: initial,
        zoom,
        disableDefaultUI: false,
        mapTypeControl: false,
        streetViewControl: false,
      });
    }
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = markers.map(
      (mk) =>
        new g.maps.Marker({
          position: { lat: mk.lat, lng: mk.lng },
          map: mapRef.current,
          title: mk.title,
          label: mk.title ? { text: mk.title, fontSize: '10px' } : undefined,
        }),
    );
    if (markers.length > 0) {
      const bounds = new g.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [ready, markers, center, zoom]);

  if (!apiKey) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface2 p-6 text-center text-sm text-muted"
        style={{ height }}
      >
        <p className="font-medium text-fg">{t('map.notEnabled')}</p>
        <p>{t('map.addKeyHint')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" style={{ height }}>
        {t('map.loadError', { msg: error })}
      </div>
    );
  }

  return <div ref={divRef} className="overflow-hidden rounded-xl border border-border" style={{ height }} />;
}
