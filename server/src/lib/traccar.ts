import { env } from '../env';

// Traccar REST API integration (open-source GPS tracking server).
// Works for phones (Traccar Client app) and hardware trackers mounted in cars.
// https://www.traccar.org/api-reference/
//
// Auth: a permanent API token is preferred (`TRACCAR_TOKEN`).
// Fallback: basic auth with `TRACCAR_USER` / `TRACCAR_PASSWORD`.

export interface TraccarPosition {
  deviceId: number;
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  fixTime?: string;
  deviceTime?: string;
  attributes?: Record<string, unknown>;
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status?: string;
  lastUpdate?: string;
}

function authHeader(): Record<string, string> {
  if (env.traccarToken) return { Authorization: `Bearer ${env.traccarToken}` };
  if (env.traccarUser && env.traccarPassword) {
    const basic = Buffer.from(`${env.traccarUser}:${env.traccarPassword}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  return {};
}

async function traccarGet<T>(path: string): Promise<T> {
  if (!env.traccarUrl) throw new Error('Traccar is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${env.traccarUrl}${path}`, {
      headers: { Accept: 'application/json', ...authHeader() },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Traccar ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchTraccarDevices(): Promise<TraccarDevice[]> {
  return traccarGet<TraccarDevice[]>('/api/devices');
}

export function fetchTraccarPositions(): Promise<TraccarPosition[]> {
  return traccarGet<TraccarPosition[]>('/api/positions');
}

// Returns the latest position per device id.
export async function fetchLatestPositions(): Promise<Map<number, TraccarPosition>> {
  const positions = await fetchTraccarPositions();
  const map = new Map<number, TraccarPosition>();
  for (const p of positions) {
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
    map.set(p.deviceId, p);
  }
  return map;
}

// Traccar records device ids as numbers; our Driver.traccarDeviceId is a string.
export function parseDeviceId(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
