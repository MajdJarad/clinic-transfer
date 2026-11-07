import { useEffect, useState } from 'react';
import { api } from './api';

// Public runtime configuration served by the backend (/api/config): map key and defaults, plus the
// clinic name and map center that an admin edits under Administration > Settings.
export interface MapConfig {
  mapProvider: string;
  googleMapsApiKey: string;
  googleMapId: string; // optional Cloud Map ID (vector map -> heading-up navigation)
  traccarEnabled: boolean;
  clinicName: string;
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
}

const FALLBACK: MapConfig = {
  mapProvider: 'google',
  googleMapsApiKey: '',
  googleMapId: '',
  traccarEnabled: false,
  clinicName: '',
  defaultCenter: { lat: 41.0082, lng: 28.9784 },
  defaultZoom: 11,
};

let cached: MapConfig | undefined;
let inflight: Promise<void> | null = null;
const listeners = new Set<(c: MapConfig) => void>();

function load(): Promise<void> {
  return api
    .config()
    .then((c) => {
      cached = { ...FALLBACK, ...c };
    })
    .catch(() => {
      cached = cached ?? FALLBACK;
    })
    .then(() => listeners.forEach((l) => l(cached!)));
}

/** Re-read the configuration (call after saving settings so every screen picks up the change). */
export function refreshConfig(): Promise<void> {
  return load();
}

export function useMapConfig(): MapConfig {
  const [config, setConfig] = useState<MapConfig>(cached ?? FALLBACK);
  useEffect(() => {
    listeners.add(setConfig);
    if (cached === undefined) inflight ??= load();
    else setConfig(cached);
    return () => {
      listeners.delete(setConfig);
    };
  }, []);
  return config;
}

/** The clinic's name as set by the admin ('' until loaded); also becomes the browser tab title. */
export function useClinicName(): string {
  const { clinicName } = useMapConfig();
  useEffect(() => {
    if (clinicName) document.title = clinicName;
  }, [clinicName]);
  return clinicName;
}
