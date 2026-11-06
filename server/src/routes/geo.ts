import { Router } from 'express';
import { env, googleMapsEnabled } from '../env';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate } from '../middleware/auth';

export const geoRouter = Router();

geoRouter.use(authenticate);

type LatLng = { lat: number; lng: number };
type RouteResult = {
  distance: number; // meters
  duration: number; // seconds
  geometry: { type: 'LineString'; coordinates: [number, number][] }; // [lng, lat]
};
type SearchResult = { label: string; lat: number; lng: number };

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Decode a Google encoded polyline into [lng, lat] pairs (GeoJSON order).
function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

// ── Google: Routes API (traffic-aware driving directions) ──
async function googleRoute(from: LatLng, to: LatLng, mode: string): Promise<RouteResult> {
  const travelMode = mode === 'walking' ? 'WALK' : 'DRIVE';
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode,
    languageCode: 'ar',
    units: 'METRIC',
  };
  if (travelMode === 'DRIVE') body.routingPreference = 'TRAFFIC_AWARE';

  const r = await fetchWithTimeout(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.googleMapsApiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
    },
    10000,
  );
  if (!r.ok) throw new HttpError(502, `Google Routes error (${r.status})`);
  const data = (await r.json()) as {
    routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
  };
  const route = data.routes?.[0];
  if (!route?.polyline?.encodedPolyline) throw new HttpError(404, 'No route found');
  return {
    distance: route.distanceMeters ?? 0,
    duration: parseInt(route.duration ?? '0', 10) || 0, // e.g. "2219s"
    geometry: { type: 'LineString', coordinates: decodePolyline(route.polyline.encodedPolyline) },
  };
}

// ── Google: Places API (New) text search, biased to the map's default area ──
async function googleSearch(q: string, limit: number): Promise<SearchResult[]> {
  const r = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.googleMapsApiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery: q,
        languageCode: 'ar',
        regionCode: 'TR',
        pageSize: Math.min(Math.max(limit, 1), 20),
        locationBias: {
          circle: {
            center: { latitude: env.mapCenterLat, longitude: env.mapCenterLng },
            radius: 50000,
          },
        },
      }),
    },
    8000,
  );
  if (!r.ok) throw new HttpError(502, `Google Places error (${r.status})`);
  const data = (await r.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }[];
  };
  return (data.places ?? [])
    .filter((p) => p.location)
    .map((p) => {
      const name = p.displayName?.text ?? '';
      const addr = p.formattedAddress ?? '';
      return {
        label: name && addr && !addr.startsWith(name) ? `${name}، ${addr}` : addr || name,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
      };
    });
}

// ── Fallback (no Google key): OSRM routing + Nominatim search (OpenStreetMap) ──
async function osrmRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const url = `${env.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
  const r = await fetchWithTimeout(url, {}, 10000);
  if (!r.ok) throw new HttpError(502, `Routing service error (${r.status})`);
  const data = (await r.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (data.code !== 'Ok' || !data.routes?.length) throw new HttpError(404, 'No route found');
  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: { type: 'LineString', coordinates: route.geometry.coordinates },
  };
}

async function nominatimSearch(q: string, limit: number): Promise<SearchResult[]> {
  const url =
    `${env.nominatimUrl}/search?format=jsonv2&addressdetails=1&limit=${limit}` +
    `&q=${encodeURIComponent(q)}`;
  const r = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': 'ClinicTransferApp/1.0 (patient-transfer)', Accept: 'application/json' } },
    8000,
  );
  if (!r.ok) throw new HttpError(502, `Geocoding service error (${r.status})`);
  const items = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  return items.map((i) => ({ label: i.display_name, lat: Number(i.lat), lng: Number(i.lon) }));
}

// Driving route. Example: /api/geo/route?from=41.0082,28.9784&to=41.0422,29.0094&mode=driving
geoRouter.get(
  '/route',
  asyncHandler(async (req, res) => {
    const { from, to, mode } = req.query as { from?: string; to?: string; mode?: string };
    if (!from || !to) throw new HttpError(400, 'from and to are required as "lat,lng"');

    const parse = (v: string): LatLng => {
      const [lat, lng] = v.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'Invalid coordinate');
      return { lat, lng };
    };
    const a = parse(from);
    const b = parse(to);

    res.json(googleMapsEnabled ? await googleRoute(a, b, mode ?? 'driving') : await osrmRoute(a, b));
  }),
);

// Address / place search (Istanbul-biased when using Google).
geoRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as { q?: string; limit?: string };
    if (!q || q.trim().length < 2) return res.json([]);
    const n = Number(limit) || 6;
    res.json(googleMapsEnabled ? await googleSearch(q.trim(), n) : await nominatimSearch(q.trim(), n));
  }),
);
