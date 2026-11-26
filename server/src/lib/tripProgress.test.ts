import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../db';
import { ARRIVE_RADIUS_M, LEAVE_RADIUS_M, nextAutoStatus, progressTripFromPosition } from './tripProgress';

vi.mock('../db', () => ({ prisma: { trip: { findMany: vi.fn(), update: vi.fn() }, driver: { update: vi.fn() } } }));

const M = 1 / 110540; // degrees of latitude per meter
const at = (lat: number, lng: number) => ({ lat, lng });
const trip = (status: string) => ({ status, originLat: 41.0, originLng: 29.0, destLat: 41.05, destLng: 29.05 });
const northOf = (p: { lat: number; lng: number }, meters: number) => at(p.lat + meters * M, p.lng);

describe('a trip follows the driver\'s position', () => {
  it('arrives at the patient when the car gets close to the pick-up point', () => {
    expect(nextAutoStatus(trip('EN_ROUTE'), northOf(at(41.0, 29.0), ARRIVE_RADIUS_M - 10))).toBe('ARRIVED');
    expect(nextAutoStatus(trip('EN_ROUTE'), northOf(at(41.0, 29.0), ARRIVE_RADIUS_M + 60))).toBeNull();
  });
  it('picks the patient up once the car has driven away from the pick-up point', () => {
    expect(nextAutoStatus(trip('ARRIVED'), northOf(at(41.0, 29.0), 30))).toBeNull(); // still waiting
    expect(nextAutoStatus(trip('ARRIVED'), northOf(at(41.0, 29.0), LEAVE_RADIUS_M - 20))).toBeNull(); // GPS wander
    expect(nextAutoStatus(trip('ARRIVED'), northOf(at(41.0, 29.0), LEAVE_RADIUS_M + 50))).toBe('PICKED_UP');
  });
  it('completes the trip near the destination', () => {
    expect(nextAutoStatus(trip('PICKED_UP'), northOf(at(41.05, 29.05), 50))).toBe('COMPLETED');
    expect(nextAutoStatus(trip('PICKED_UP'), at(41.02, 29.02))).toBeNull();
  });
  it('does not skip steps and ignores trips that have not started or are over', () => {
    expect(nextAutoStatus(trip('EN_ROUTE'), at(41.05, 29.05))).toBeNull(); // at the destination but not yet picked up
    for (const s of ['SCHEDULED', 'ASSIGNED', 'COMPLETED', 'CANCELLED']) expect(nextAutoStatus(trip(s), at(41.0, 29.0))).toBeNull();
  });
  it('does not trust a vague GPS fix', () => {
    expect(nextAutoStatus(trip('EN_ROUTE'), { ...at(41.0, 29.0), accuracy: 400 })).toBeNull();
    expect(nextAutoStatus(trip('EN_ROUTE'), { ...at(41.0, 29.0), accuracy: 10 })).toBe('ARRIVED');
  });
  it('cannot move a trip that has no saved coordinates', () => {
    expect(nextAutoStatus({ status: 'EN_ROUTE', originLat: null, originLng: null, destLat: null, destLng: null }, at(41.0, 29.0))).toBeNull();
    expect(nextAutoStatus({ status: 'PICKED_UP', originLat: 41, originLng: 29, destLat: null, destLng: null }, at(41.05, 29.05))).toBeNull();
  });
});

describe('progressTripFromPosition: a forgotten trip must not block the real one', () => {
  const row = (id: string, status: string, lat: number, lng: number) => ({ id, driverId: 'd1', status, originLat: lat, originLng: lng, destLat: 41.1, destLng: 29.1 });
  beforeEach(() => {
    vi.mocked(prisma.trip.update).mockReset().mockImplementation((async (args: { where: { id: string }; data: { status: string } }) => ({ id: args.where.id, status: args.data.status })) as never);
    vi.mocked(prisma.driver.update).mockReset().mockResolvedValue({} as never);
  });

  it('moves the trip the car is really at, even when an older trip is still marked "on the way"', async () => {
    // The older trip was started days ago and never finished; its pick-up is 5 km away.
    vi.mocked(prisma.trip.findMany).mockResolvedValue([row('old', 'EN_ROUTE', 41.05, 29.05), row('now', 'EN_ROUTE', 41.0, 29.0)] as never);
    const moved = await progressTripFromPosition('d1', at(41.0, 29.0));
    expect(moved).toEqual({ tripId: 'now', status: 'ARRIVED' });
    expect(vi.mocked(prisma.trip.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.trip.update).mock.calls[0][0].where).toEqual({ id: 'now' });
  });

  it('changes nothing when no trip is at the car\'s position', async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([row('a', 'EN_ROUTE', 41.05, 29.05)] as never);
    expect(await progressTripFromPosition('d1', at(41.0, 29.0))).toBeNull();
    expect(vi.mocked(prisma.trip.update)).not.toHaveBeenCalled();
  });

  it('moves every trip that is at the same place (two patients picked up together)', async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([row('p1', 'EN_ROUTE', 41.0, 29.0), row('p2', 'EN_ROUTE', 41.0, 29.0)] as never);
    expect(await progressTripFromPosition('d1', at(41.0, 29.0))).toEqual({ tripId: 'p1', status: 'ARRIVED' });
    expect(vi.mocked(prisma.trip.update)).toHaveBeenCalledTimes(2);
  });
});
