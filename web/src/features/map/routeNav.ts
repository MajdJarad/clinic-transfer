// Pure navigation logic (no React, no Google): geometry, route progress, formatting.
// Kept separate so it can be unit-tested on its own.

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
  speed: 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM';
}

export interface RouteData {
  distance: number; // meters
  duration: number; // seconds
  geometry: { type: string; coordinates: [number, number][] }; // [lng, lat]
  steps: NavStep[];
  traffic: TrafficSeg[];
  summary?: string;
  label?: string;
}

export interface GeoRouteResponse extends RouteData {
  routes: RouteData[];
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing a -> b in degrees (0 = north, clockwise). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// ───────────── Path index (cumulative distances) ─────────────

export interface PathIndex {
  path: LatLng[];
  cum: number[]; // cum[i] = meters from path[0] to path[i]
  total: number;
}

export function buildPathIndex(coords: [number, number][]): PathIndex {
  const path: LatLng[] = coords.map((c) => ({ lat: c[1], lng: c[0] }));
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  return { path, cum, total: cum[cum.length - 1] ?? 0 };
}

export interface Snap {
  index: number; // segment start index
  point: LatLng; // closest point on the route
  dist: number; // meters from the given position to the route
  along: number; // meters from route start to `point`
}

function snapRange(pi: PathIndex, p: LatLng, lo: number, hi: number): Snap {
  const cosLat = Math.cos(rad(p.lat));
  let best: Snap = { index: 0, point: pi.path[0], dist: Infinity, along: 0 };
  for (let i = lo; i < hi; i++) {
    const a = pi.path[i];
    const b = pi.path[i + 1];
    // Local flat projection, meters, origin at p.
    const ax = (a.lng - p.lng) * cosLat * 111320;
    const ay = (a.lat - p.lat) * 110540;
    const bx = (b.lng - p.lng) * cosLat * 111320;
    const by = (b.lat - p.lat) * 110540;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = Math.sqrt(px * px + py * py);
    if (dist < best.dist) {
      const segLen = pi.cum[i + 1] - pi.cum[i];
      best = {
        index: i,
        point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) },
        dist,
        along: pi.cum[i] + t * segLen,
      };
    }
  }
  return best;
}

/**
 * Closest point of the route to `p`. Searches a window around `hint` first (cheap and avoids
 * jumping to a distant part of a looping route), then falls back to the whole route.
 */
export function snapToPath(pi: PathIndex, p: LatLng, hint = 0, window = 300): Snap {
  const segs = pi.path.length - 1;
  if (segs < 1) return { index: 0, point: pi.path[0] ?? p, dist: pi.path[0] ? haversine(pi.path[0], p) : 0, along: 0 };
  const lo = Math.max(0, hint - 20);
  const hi = Math.min(segs, hint + window);
  const local = snapRange(pi, p, lo, hi);
  if (local.dist <= 60 || (lo === 0 && hi === segs)) return local;
  const global = snapRange(pi, p, 0, segs);
  return global.dist < local.dist ? global : local;
}

/** Position `along` meters from the route start (clamped), plus the heading there. */
export function pointAt(pi: PathIndex, along: number): { point: LatLng; heading: number; index: number } {
  const a = Math.max(0, Math.min(pi.total, along));
  let lo = 0;
  let hi = pi.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pi.cum[mid] <= a) lo = mid;
    else hi = mid;
  }
  const i = Math.min(lo, pi.path.length - 2);
  if (i < 0) return { point: pi.path[0], heading: 0, index: 0 };
  const seg = pi.cum[i + 1] - pi.cum[i];
  const t = seg > 0 ? (a - pi.cum[i]) / seg : 0;
  const A = pi.path[i];
  const B = pi.path[i + 1];
  return {
    point: { lat: A.lat + t * (B.lat - A.lat), lng: A.lng + t * (B.lng - A.lng) },
    heading: bearing(A, B),
    index: i,
  };
}

// ───────────── Route progress ─────────────

export interface RouteModel {
  route: RouteData;
  pi: PathIndex;
  /** stepEnd[i] = meters from route start where step i ends (scaled to the polyline length). */
  stepEnd: number[];
  /** seconds, traffic-aware: route.duration / sum(step free-flow durations). */
  trafficRatio: number;
  staticTotal: number;
}

export function buildRouteModel(route: RouteData): RouteModel {
  const pi = buildPathIndex(route.geometry.coordinates);
  const sumDist = route.steps.reduce((a, s) => a + s.distance, 0);
  const scale = sumDist > 0 ? pi.total / sumDist : 1;
  let acc = 0;
  const stepEnd = route.steps.map((s) => (acc += s.distance * scale));
  if (stepEnd.length) stepEnd[stepEnd.length - 1] = pi.total; // last step ends exactly at the destination
  const staticTotal = route.steps.reduce((a, s) => a + s.duration, 0);
  const trafficRatio = staticTotal > 0 && route.duration > 0 ? route.duration / staticTotal : 1;
  return { route, pi, stepEnd, trafficRatio, staticTotal };
}

export interface Progress {
  stepIndex: number; // step currently being driven
  distToManeuver: number; // meters until the next maneuver (or the destination)
  remainingDist: number;
  remainingDur: number; // seconds
  arrived: boolean;
}

export const ARRIVAL_RADIUS_M = 30;

export function computeProgress(m: RouteModel, along: number): Progress {
  const remainingDist = Math.max(0, m.pi.total - along);
  const steps = m.route.steps;
  let stepIndex = 0;
  while (stepIndex < steps.length - 1 && m.stepEnd[stepIndex] <= along + 1) stepIndex++;
  const distToManeuver = steps.length ? Math.max(0, m.stepEnd[stepIndex] - along) : remainingDist;

  let remainingDur: number;
  if (steps.length && m.staticTotal > 0) {
    const stepStart = stepIndex === 0 ? 0 : m.stepEnd[stepIndex - 1];
    const stepLen = Math.max(1, m.stepEnd[stepIndex] - stepStart);
    const fracLeft = Math.min(1, Math.max(0, (m.stepEnd[stepIndex] - along) / stepLen));
    let stat = steps[stepIndex].duration * fracLeft;
    for (let i = stepIndex + 1; i < steps.length; i++) stat += steps[i].duration;
    remainingDur = stat * m.trafficRatio;
  } else {
    remainingDur = m.pi.total > 0 ? (m.route.duration * remainingDist) / m.pi.total : 0;
  }
  return { stepIndex, distToManeuver, remainingDist, remainingDur, arrived: remainingDist <= ARRIVAL_RADIUS_M };
}

/** What the banner shows: the maneuver at the END of the current step (= start of the next one). */
export interface Upcoming {
  maneuver: string;
  instruction: string;
  isArrival: boolean;
}

export function upcomingManeuver(m: RouteModel, stepIndex: number, destinationLabel: string): Upcoming {
  const next = m.route.steps[stepIndex + 1];
  if (!next) return { maneuver: 'DESTINATION', instruction: destinationLabel ? `الوجهة: ${destinationLabel}` : 'الوصول إلى الوجهة', isArrival: true };
  return { maneuver: next.maneuver, instruction: next.instruction, isArrival: false };
}

// ───────────── Formatting ─────────────

export function formatDistance(m: number): string {
  if (m < 1000) {
    const r = m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50;
    return `${Math.max(r, 0)} م`;
  }
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} كم`;
}

export function formatDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} د`;
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return mm ? `${h} س ${mm} د` : `${h} س`;
}

/** Spoken distance, e.g. "500 متر" / "1.5 كيلومتر". */
export function speakDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} متر`;
  return `${(m / 1000).toFixed(1)} كيلومتر`;
}

export function arrivalClock(remainingSec: number, now = Date.now()): string {
  return new Date(now + remainingSec * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ───────────── Live traffic along the route ─────────────

export interface TrafficZone {
  speed: 'SLOW' | 'TRAFFIC_JAM'; // the worst condition inside the zone
  start: number; // meters from the route start
  end: number;
}

/** Congested stretches of the route as distances along it; stretches closer than `gap` m are merged. */
export function trafficZones(m: RouteModel, gap = 150): TrafficZone[] {
  const last = m.pi.cum.length - 1;
  const at = (i: number) => m.pi.cum[Math.max(0, Math.min(last, i))];
  const raw = m.route.traffic
    .filter((t) => t.speed === 'SLOW' || t.speed === 'TRAFFIC_JAM')
    .map((t) => ({ speed: t.speed as 'SLOW' | 'TRAFFIC_JAM', start: at(t.from), end: at(t.to) }))
    .filter((z) => z.end > z.start)
    .sort((a, b) => a.start - b.start);
  const zones: TrafficZone[] = [];
  for (const z of raw) {
    const prev = zones[zones.length - 1];
    if (prev && z.start - prev.end <= gap) {
      prev.end = Math.max(prev.end, z.end);
      if (z.speed === 'TRAFFIC_JAM') prev.speed = 'TRAFFIC_JAM';
    } else zones.push({ ...z });
  }
  return zones;
}

export interface TrafficAhead extends TrafficZone {
  /** Meters until it starts (0 when already inside). */
  startsIn: number;
  /** Meters of it still ahead. */
  length: number;
  inside: boolean;
}

/** The next congested stretch within `horizon` meters (or the one the vehicle is in), if any. */
export function trafficAhead(m: RouteModel, along: number, horizon = 15000): TrafficAhead | null {
  for (const z of trafficZones(m)) {
    if (z.end <= along) continue;
    if (z.start - along > horizon) return null;
    const inside = z.start <= along;
    return { ...z, startsIn: Math.max(0, z.start - along), length: z.end - Math.max(z.start, along), inside };
  }
  return null;
}

/**
 * Whether `b` follows (almost) the same roads as `a`: used to tell a refreshed estimate of the
 * current route from a genuinely different route. Samples b and checks it lies on a.
 */
export function isSameRoute(a: PathIndex, b: PathIndex, tolerance = 40): boolean {
  if (a.path.length < 2 || b.path.length < 2) return false;
  const step = Math.max(1, Math.floor(b.path.length / 60));
  let near = 0;
  let total = 0;
  for (let i = 0; i < b.path.length; i += step) {
    total++;
    if (snapToPath(a, b.path[i], 0, a.path.length).dist <= tolerance) near++;
  }
  return near / total >= 0.85;
}
