import { Router } from 'express';
import { env, googleMapsEnabled } from '../env';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate } from '../middleware/auth';

export const geoRouter = Router();

geoRouter.use(authenticate);

type LatLng = { lat: number; lng: number };
type NavStep = {
  instruction: string;
  maneuver: string;
  distance: number; // meters
  duration: number; // seconds (free-flow)
  start: LatLng;
  end: LatLng;
};
type TrafficSeg = { from: number; to: number; speed: 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM' };
type RouteResult = {
  distance: number; // meters
  duration: number; // seconds (traffic-aware when available)
  geometry: { type: 'LineString'; coordinates: [number, number][] }; // [lng, lat]
  steps: NavStep[];
  traffic: TrafficSeg[]; // index ranges into geometry.coordinates
  summary?: string;
  label?: string;
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

// ── Google: Routes API (traffic-aware directions with turn-by-turn steps) ──
const ROUTE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.description',
  'routes.routeLabels',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.navigationInstruction',
  'routes.travelAdvisory.speedReadingIntervals',
].join(',');

const seconds = (v?: string) => parseInt(v ?? '0', 10) || 0; // Google durations look like "2219s"

// Strip invisible bidi marks Google wraps around place names (they break speech and string compare).
const cleanText = (v?: string) => (v ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();

type GoogleRoute = {
  duration?: string;
  distanceMeters?: number;
  description?: string;
  routeLabels?: string[];
  polyline?: { encodedPolyline?: string };
  legs?: {
    steps?: {
      distanceMeters?: number;
      staticDuration?: string;
      startLocation?: { latLng: { latitude: number; longitude: number } };
      endLocation?: { latLng: { latitude: number; longitude: number } };
      navigationInstruction?: { maneuver?: string; instructions?: string };
    }[];
  }[];
  travelAdvisory?: {
    speedReadingIntervals?: {
      startPolylinePointIndex?: number;
      endPolylinePointIndex?: number;
      speed?: string;
    }[];
  };
};

function toRouteResult(r: GoogleRoute): RouteResult | null {
  const encoded = r.polyline?.encodedPolyline;
  if (!encoded) return null;
  const coordinates = decodePolyline(encoded);
  const steps: NavStep[] = (r.legs ?? [])
    .flatMap((leg) => leg.steps ?? [])
    .filter((st) => st.startLocation && st.endLocation)
    .map((st) => ({
      instruction: cleanText(st.navigationInstruction?.instructions),
      maneuver: st.navigationInstruction?.maneuver ?? 'STRAIGHT',
      distance: st.distanceMeters ?? 0,
      duration: seconds(st.staticDuration),
      start: { lat: st.startLocation!.latLng.latitude, lng: st.startLocation!.latLng.longitude },
      end: { lat: st.endLocation!.latLng.latitude, lng: st.endLocation!.latLng.longitude },
    }));
  const traffic: TrafficSeg[] = (r.travelAdvisory?.speedReadingIntervals ?? [])
    .filter((i) => i.speed === 'SLOW' || i.speed === 'TRAFFIC_JAM')
    .map((i) => ({
      from: i.startPolylinePointIndex ?? 0,
      to: i.endPolylinePointIndex ?? 0,
      speed: i.speed as 'SLOW' | 'TRAFFIC_JAM',
    }));
  return {
    distance: r.distanceMeters ?? 0,
    duration: seconds(r.duration),
    geometry: { type: 'LineString', coordinates },
    steps,
    traffic,
    summary: cleanText(r.description) || undefined,
    label: r.routeLabels?.[0],
  };
}

async function googleRoutes(from: LatLng, to: LatLng, mode: string, alternatives: boolean): Promise<RouteResult[]> {
  const travelMode = mode === 'walking' ? 'WALK' : 'DRIVE';
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode,
    languageCode: 'ar',
    units: 'METRIC',
    computeAlternativeRoutes: alternatives,
  };
  if (travelMode === 'DRIVE') {
    body.routingPreference = 'TRAFFIC_AWARE';
    body.extraComputations = ['TRAFFIC_ON_POLYLINE'];
  }

  const r = await fetchWithTimeout(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.googleMapsApiKey,
        'X-Goog-FieldMask': ROUTE_FIELDS,
      },
      body: JSON.stringify(body),
    },
    12000,
  );
  if (!r.ok) throw new HttpError(502, `Google Routes error (${r.status})`);
  const data = (await r.json()) as { routes?: GoogleRoute[] };
  const routes = (data.routes ?? []).map(toRouteResult).filter((x): x is RouteResult => x !== null);
  if (!routes.length) throw new HttpError(404, 'No route found');
  return routes;
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
    steps: [],
    traffic: [],
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

// Route + turn-by-turn steps. Example:
//   /api/geo/route?from=41.0082,28.9784&to=41.0422,29.0094&mode=driving&alt=1
// The first route is also flattened onto the top level of the response, for older clients.
geoRouter.get(
  '/route',
  asyncHandler(async (req, res) => {
    const { from, to, mode, alt } = req.query as { from?: string; to?: string; mode?: string; alt?: string };
    if (!from || !to) throw new HttpError(400, 'from and to are required as "lat,lng"');

    const parse = (v: string): LatLng => {
      const [lat, lng] = v.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new HttpError(400, 'Invalid coordinate');
      }
      return { lat, lng };
    };
    const a = parse(from);
    const b = parse(to);

    const routes = googleMapsEnabled
      ? await googleRoutes(a, b, mode ?? 'driving', alt !== '0' && (mode ?? 'driving') !== 'walking')
      : [await osrmRoute(a, b)];
    res.json({ ...routes[0], routes });
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

// ── Search-as-you-type (Places API New autocomplete) ──
geoRouter.get(
  '/autocomplete',
  asyncHandler(async (req, res) => {
    const { q, session } = req.query as { q?: string; session?: string };
    if (!q || q.trim().length < 2) return res.json([]);
    if (!googleMapsEnabled) throw new HttpError(503, 'Google Maps is not configured');

    const r = await fetchWithTimeout(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.googleMapsApiKey },
        body: JSON.stringify({
          input: q.trim(),
          languageCode: 'ar',
          locationBias: {
            circle: { center: { latitude: env.mapCenterLat, longitude: env.mapCenterLng }, radius: 50000 },
          },
          ...(session && /^[A-Za-z0-9_-]{8,36}$/.test(session) ? { sessionToken: session } : {}),
        }),
      },
      6000,
    );
    if (!r.ok) throw new HttpError(502, `Google Places error (${r.status})`);
    const data = (await r.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }[];
    };
    res.json(
      (data.suggestions ?? [])
        .filter((s) => s.placePrediction?.placeId)
        .map((s) => {
          const p = s.placePrediction!;
          return {
            placeId: p.placeId,
            main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
            secondary: p.structuredFormat?.secondaryText?.text ?? '',
          };
        }),
    );
  }),
);

// Resolve a suggestion to coordinates.
geoRouter.get(
  '/place/:id',
  asyncHandler(async (req, res) => {
    const { session } = req.query as { session?: string };
    const id = req.params.id;
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new HttpError(400, 'Invalid place id');
    if (!googleMapsEnabled) throw new HttpError(503, 'Google Maps is not configured');

    const qs = new URLSearchParams({ languageCode: 'ar' });
    if (session && /^[A-Za-z0-9_-]{8,36}$/.test(session)) qs.set('sessionToken', session);
    const r = await fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${id}?${qs}`,
      {
        headers: {
          'X-Goog-Api-Key': env.googleMapsApiKey,
          'X-Goog-FieldMask': 'displayName,formattedAddress,location',
        },
      },
      6000,
    );
    if (r.status === 404) throw new HttpError(404, 'Place not found');
    if (!r.ok) throw new HttpError(502, `Google Places error (${r.status})`);
    const p = (await r.json()) as {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    };
    if (!p.location) throw new HttpError(404, 'Place has no location');
    const name = p.displayName?.text ?? '';
    const addr = p.formattedAddress ?? '';
    res.json({
      label: name && addr && !addr.startsWith(name) ? `${name}، ${addr}` : addr || name,
      name,
      lat: p.location.latitude,
      lng: p.location.longitude,
    });
  }),
);
