import { useEffect, useState } from 'react';
import { api } from './api';

export interface MapConfig {
  mapProvider: string;
  googleMapsApiKey: string;
  tomtomTraffic: boolean;
  tomtomApiKey: string;
  traccarEnabled: boolean;
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
}

const FALLBACK: MapConfig = {
  mapProvider: 'osm',
  googleMapsApiKey: '',
  tomtomTraffic: false,
  tomtomApiKey: '',
  traccarEnabled: false,
  defaultCenter: { lat: 41.0082, lng: 28.9784 },
  defaultZoom: 11,
};

let cached: MapConfig | undefined;

function applyLocalOverrides(base: MapConfig): MapConfig {
  try {
    const raw = localStorage.getItem('clinic_app_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...base,
        mapProvider: parsed.mapProvider || base.mapProvider,
        googleMapsApiKey: parsed.googleMapsApiKey || base.googleMapsApiKey,
        defaultCenter: {
          lat: parsed.mapCenterLat ? parseFloat(parsed.mapCenterLat) : base.defaultCenter.lat,
          lng: parsed.mapCenterLng ? parseFloat(parsed.mapCenterLng) : base.defaultCenter.lng,
        },
        defaultZoom: parsed.mapZoom ? parseInt(parsed.mapZoom, 10) : base.defaultZoom,
      };
    }
  } catch {
    // ignore
  }
  return base;
}

export function useMapConfig(): MapConfig {
  const [config, setConfig] = useState<MapConfig>(() => applyLocalOverrides(cached ?? FALLBACK));

  useEffect(() => {
    if (cached !== undefined) return;
    api
      .config()
      .then((c) => {
        cached = { ...FALLBACK, ...c };
        setConfig(applyLocalOverrides(cached));
      })
      .catch(() => {
        cached = FALLBACK;
        setConfig(applyLocalOverrides(FALLBACK));
      });
  }, []);

  return config;
}
