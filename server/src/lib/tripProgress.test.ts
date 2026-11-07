import { describe, expect, it } from 'vitest';
import { ARRIVE_RADIUS_M, LEAVE_RADIUS_M, nextAutoStatus } from './tripProgress';

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
