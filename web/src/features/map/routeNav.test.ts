import { describe, expect, it } from 'vitest';
import {
  buildRouteModel,
  computeProgress,
  formatDistance,
  formatDuration,
  haversine,
  pointAt,
  snapToPath,
  upcomingManeuver,
  type RouteData,
} from './routeNav';

// A synthetic trip: 2 km north, then 2 km east, in 10 m polyline segments, with 3 steps.
const LAT = 41;
const LNG = 29;
const M_LAT = 1 / 110540; // degrees per meter
const M_LNG = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));

function makeRoute(): RouteData {
  const coords: [number, number][] = [];
  for (let i = 0; i <= 200; i++) coords.push([LNG, LAT + i * 10 * M_LAT]); // north
  for (let i = 1; i <= 200; i++) coords.push([LNG + i * 10 * M_LNG, LAT + 2000 * M_LAT]); // east
  const at = (north: number, east: number) => ({ lat: LAT + north * M_LAT, lng: LNG + east * M_LNG });
  return {
    distance: 4000,
    duration: 600, // traffic-aware; free-flow steps below add up to 480 s
    geometry: { type: 'LineString', coordinates: coords },
    traffic: [],
    steps: [
      { instruction: 'اتجه شمالاً', maneuver: 'DEPART', distance: 1000, duration: 120, start: at(0, 0), end: at(1000, 0) },
      { instruction: 'تابع السير', maneuver: 'STRAIGHT', distance: 1000, duration: 120, start: at(1000, 0), end: at(2000, 0) },
      { instruction: 'انعطف يميناً', maneuver: 'TURN_RIGHT', distance: 2000, duration: 240, start: at(2000, 0), end: at(2000, 2000) },
    ],
  };
}

describe('route model', () => {
  const m = buildRouteModel(makeRoute());

  it('measures the polyline and ends the last step at the destination', () => {
    expect(m.pi.total).toBeGreaterThan(3990);
    expect(m.pi.total).toBeLessThan(4010);
    expect(m.stepEnd[m.stepEnd.length - 1]).toBe(m.pi.total);
  });

  it('starts on step 0 with the full distance and the traffic-aware duration remaining', () => {
    const p = computeProgress(m, 0);
    expect(p.stepIndex).toBe(0);
    expect(p.arrived).toBe(false);
    expect(p.remainingDist).toBeCloseTo(m.pi.total, 0);
    expect(Math.abs(p.remainingDur - 600)).toBeLessThan(2);
  });

  it('advances through the steps and reports the distance to the next maneuver', () => {
    expect(computeProgress(m, 950).stepIndex).toBe(0);
    expect(Math.abs(computeProgress(m, 950).distToManeuver - 50)).toBeLessThan(5);
    expect(computeProgress(m, 1010).stepIndex).toBe(1);
    expect(computeProgress(m, 2500).stepIndex).toBe(2);
  });

  it('shows the maneuver that ends the current step, and arrival on the last step', () => {
    expect(upcomingManeuver(m, 0, 'X').maneuver).toBe('STRAIGHT');
    expect(upcomingManeuver(m, 1, 'X').maneuver).toBe('TURN_RIGHT');
    const last = upcomingManeuver(m, 2, 'العيادة');
    expect(last.isArrival).toBe(true);
    expect(last.instruction).toContain('العيادة');
  });

  it('is arrived within the arrival radius, with nothing left', () => {
    const p = computeProgress(m, m.pi.total - 10);
    expect(p.arrived).toBe(true);
    expect(computeProgress(m, m.pi.total).remainingDur).toBeLessThan(1);
  });

  it('never goes backwards while driving the whole route', () => {
    let lastStep = 0;
    let lastRemaining = Infinity;
    let hint = 0;
    for (let a = 0; a <= m.pi.total; a += 25) {
      const s = snapToPath(m.pi, pointAt(m.pi, a).point, hint);
      hint = s.index;
      expect(Math.abs(s.along - a)).toBeLessThan(2);
      const p = computeProgress(m, s.along);
      expect(p.stepIndex).toBeGreaterThanOrEqual(lastStep);
      expect(p.remainingDist).toBeLessThanOrEqual(lastRemaining + 1);
      lastStep = p.stepIndex;
      lastRemaining = p.remainingDist;
    }
    expect(lastStep).toBe(2);
  });
});

describe('snapping', () => {
  const m = buildRouteModel(makeRoute());

  it('keeps GPS jitter on the road', () => {
    const mid = pointAt(m.pi, 700).point;
    const s = snapToPath(m.pi, { lat: mid.lat, lng: mid.lng + 8 * M_LNG }, 60);
    expect(s.dist).toBeGreaterThan(5);
    expect(s.dist).toBeLessThan(10);
  });

  it('measures how far off the road a vehicle is', () => {
    const mid = pointAt(m.pi, 700).point;
    const s = snapToPath(m.pi, { lat: mid.lat, lng: mid.lng + 400 * M_LNG }, 60);
    expect(s.dist).toBeGreaterThan(390);
    expect(s.dist).toBeLessThan(410);
  });

  it('recovers from a wrong search hint', () => {
    const target = pointAt(m.pi, 3500).point;
    expect(Math.abs(snapToPath(m.pi, target, 0).along - 3500)).toBeLessThan(2);
  });
});

describe('formatting', () => {
  it('formats distances', () => {
    expect(formatDistance(48)).toBe('50 م');
    expect(formatDistance(340)).toBe('350 م');
    expect(formatDistance(1500)).toBe('1.5 كم');
    expect(formatDistance(12400)).toBe('12 كم');
  });
  it('formats durations', () => {
    expect(formatDuration(30)).toBe('1 د');
    expect(formatDuration(3320)).toBe('55 د');
    expect(formatDuration(3900)).toBe('1 س 5 د');
  });
  it('computes great-circle distance', () => {
    expect(Math.round(haversine({ lat: 41, lng: 29 }, { lat: 41.01, lng: 29 }))).toBe(1112);
  });
});
