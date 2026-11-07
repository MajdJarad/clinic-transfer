// Thin clients for the Google Maps Platform APIs used by the app:
//   Routes API (New)      - directions, alternatives, turn-by-turn steps, traffic
//   Places API (New)      - autocomplete + place details
//   Geocoding API         - reverse geocoding (tap on the map -> address)
import { env, googleMapsEnabled } from '../env';
import { HttpError } from '../lib/http';
import { TtlCache } from '../lib/ttlCache';

export type LatLng = { lat: number; lng: number };

export interface NavStep {
  instruction: string;
  maneuver: string;
  distance: number; // meters
  duration: number; // seconds (free-flow)
  start: LatLng;
  end: LatLng;
}

export interface TrafficSeg {
  from: number; // index into geometry.coordinates
  to: number;
  speed: 'SLOW' | 'TRAFFIC_JAM';
}

export interface RouteResult {
  distance: number; // meters
  duration: number; // seconds (traffic-aware when available)
  geometry: { type: 'LineString'; coordinates: [number, number][] }; // [lng, lat]
  steps: NavStep[];
  traffic: TrafficSeg[];
  summary?: string;
  label?: string;
}

export interface RouteOptions {
  mode: 'driving' | 'walking';
  /** Plan for a future departure (traffic is estimated for that time). Ignored if not in the future. */
  departureTime?: Date;
  alternatives: boolean;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
}

export interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export interface PlaceDetails {
  label: string;
  name: string;
  lat: number;
  lng: number;
}

/** Every Google-backed endpoint calls this first, so a missing key is one clear 503. */
export function assertGoogleConfigured(): void {
  if (!googleMapsEnabled) throw new HttpError(503, 'Google Maps is not configured on the server (GOOGLE_MAPS_API_KEY)');
}

async function gfetch(url: string, init: RequestInit, ms: number, what: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new HttpError(504, `${what} timed out`);
    throw new HttpError(502, `${what} is unreachable`);
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────── Polyline ─────────────────────────

/** Decode a Google encoded polyline into [lng, lat] pairs (GeoJSON order). */
export function decodePolyline(encoded: string): [number, number][] {
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

// ───────────────────────── Routes API ─────────────────────────

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

// Google wraps place names in invisible bidi marks and sometimes splits an instruction over
// several lines (e.g. toll notes). Strip the marks and join the lines so it reads/speaks cleanly.
export const cleanText = (v?: string) =>
  (v ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .split(/\s*\n+\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');

interface GoogleRoute {
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
    speedReadingIntervals?: { startPolylinePointIndex?: number; endPolylinePointIndex?: number; speed?: string }[];
  };
}

function toRouteResult(r: GoogleRoute): RouteResult | null {
  const encoded = r.polyline?.encodedPolyline;
  if (!encoded) return null;
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
    geometry: { type: 'LineString', coordinates: decodePolyline(encoded) },
    steps,
    traffic,
    summary: cleanText(r.description) || undefined,
    label: r.routeLabels?.[0],
  };
}

// Every Google call is billed: identical requests within a short window are answered from memory.
// Routes are cached briefly (traffic changes); addresses and places are stable, so they last a day.
const routeCache = new TtlCache<RouteResult[]>(60_000, 300);
const placeCache = new TtlCache<PlaceDetails>(24 * 3600_000, 1000);
const addressCache = new TtlCache<string | null>(24 * 3600_000, 1000);

const r5 = (n: number) => n.toFixed(5);

export async function computeRoutes(from: LatLng, to: LatLng, opts: RouteOptions): Promise<RouteResult[]> {
  assertGoogleConfigured();
  const departure = opts.departureTime && opts.departureTime.getTime() > Date.now() + 30_000 ? opts.departureTime : undefined;
  const cacheKey = JSON.stringify([
    r5(from.lat), r5(from.lng), r5(to.lat), r5(to.lng),
    opts.mode, opts.alternatives, opts.avoidTolls, opts.avoidHighways, opts.avoidFerries,
    departure ? Math.floor(departure.getTime() / 60_000) : 'now',
  ]);
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;
  const walking = opts.mode === 'walking';
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: walking ? 'WALK' : 'DRIVE',
    languageCode: 'ar',
    units: 'METRIC',
    computeAlternativeRoutes: opts.alternatives && !walking,
  };
  if (!walking) {
    body.routingPreference = 'TRAFFIC_AWARE';
    body.extraComputations = ['TRAFFIC_ON_POLYLINE'];
    if (departure) body.departureTime = departure.toISOString();
    if (opts.avoidTolls || opts.avoidHighways || opts.avoidFerries) {
      body.routeModifiers = {
        avoidTolls: opts.avoidTolls,
        avoidHighways: opts.avoidHighways,
        avoidFerries: opts.avoidFerries,
      };
    }
  }

  const r = await gfetch(
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
    'Google Routes',
  );
  if (!r.ok) throw new HttpError(502, `Google Routes error (${r.status})`);
  const data = (await r.json()) as { routes?: GoogleRoute[] };
  const routes = (data.routes ?? []).map(toRouteResult).filter((x): x is RouteResult => x !== null);
  if (!routes.length) throw new HttpError(404, 'No route found');
  routeCache.set(cacheKey, routes);
  return routes;
}

// ───────────────────────── Places API (New) ─────────────────────────

export async function autocompletePlaces(input: string, session: string | undefined, bias: LatLng): Promise<PlaceSuggestion[]> {
  assertGoogleConfigured();
  const r = await gfetch(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.googleMapsApiKey },
      body: JSON.stringify({
        input,
        languageCode: 'ar',
        locationBias: {
          circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 },
        },
        ...(session ? { sessionToken: session } : {}),
      }),
    },
    6000,
    'Google Places',
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
  return (data.suggestions ?? [])
    .filter((s) => s.placePrediction?.placeId)
    .map((s) => {
      const p = s.placePrediction!;
      return {
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondary: p.structuredFormat?.secondaryText?.text ?? '',
      };
    });
}

export async function getPlace(placeId: string, session?: string): Promise<PlaceDetails> {
  assertGoogleConfigured();
  const cachedPlace = placeCache.get(placeId);
  if (cachedPlace) return cachedPlace;
  const qs = new URLSearchParams({ languageCode: 'ar' });
  if (session) qs.set('sessionToken', session);
  const r = await gfetch(
    `https://places.googleapis.com/v1/places/${placeId}?${qs}`,
    {
      headers: {
        'X-Goog-Api-Key': env.googleMapsApiKey,
        'X-Goog-FieldMask': 'displayName,formattedAddress,location',
      },
    },
    6000,
    'Google Places',
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
  const place: PlaceDetails = {
    label: name && addr && !addr.startsWith(name) ? `${name}، ${addr}` : addr || name,
    name,
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
  placeCache.set(placeId, place);
  return place;
}

// ───────────────────────── Geocoding API ─────────────────────────

/** Address for a coordinate; null when Google has nothing for it. */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  assertGoogleConfigured();
  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; // ~11 m
  const hit = addressCache.get(key);
  if (hit !== undefined) return hit;
  const qs = new URLSearchParams({ latlng: `${p.lat},${p.lng}`, language: 'ar', key: env.googleMapsApiKey });
  const r = await gfetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`, {}, 6000, 'Google Geocoding');
  if (!r.ok) throw new HttpError(502, `Google Geocoding error (${r.status})`);
  const data = (await r.json()) as { status: string; results?: { formatted_address: string; types: string[] }[] };
  if (data.status === 'ZERO_RESULTS') {
    addressCache.set(key, null);
    return null;
  }
  if (data.status !== 'OK') throw new HttpError(502, `Google Geocoding error (${data.status})`);
  const results = data.results ?? [];
  const best = results.find((x) => !x.types.includes('plus_code')) ?? results[0];
  const label = best?.formatted_address ?? null;
  addressCache.set(key, label);
  return label;
}
