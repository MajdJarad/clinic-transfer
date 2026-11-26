import { prisma } from '../db';
import { haversineMeters } from './geo';

// A trip's status follows the driver's live position, so the driver never has to tap it:
//   on the way (after "Go") -> ARRIVED when within ARRIVE_RADIUS_M of the pick-up point
//   ARRIVED                 -> PICKED_UP once the car has left the pick-up point (LEAVE_RADIUS_M)
//   PICKED_UP               -> COMPLETED when within ARRIVE_RADIUS_M of the destination
export const ARRIVE_RADIUS_M = 100;
export const LEAVE_RADIUS_M = 200;
export const MAX_ACCURACY_M = 150; // a fix this vague is not trusted to change a status

export const ACTIVE_STATUSES = ['EN_ROUTE', 'ARRIVED', 'PICKED_UP'];

export interface TripPlaces {
  status: string;
  originLat: number | null;
  originLng: number | null;
  destLat: number | null;
  destLng: number | null;
}

/** The status a trip should move to given where the driver is, or null if it stays as it is. */
export function nextAutoStatus(trip: TripPlaces, pos: { lat: number; lng: number; accuracy?: number | null }): string | null {
  if (pos.accuracy != null && pos.accuracy > MAX_ACCURACY_M) return null;
  const origin = trip.originLat != null && trip.originLng != null ? { lat: trip.originLat, lng: trip.originLng } : null;
  const dest = trip.destLat != null && trip.destLng != null ? { lat: trip.destLat, lng: trip.destLng } : null;
  switch (trip.status) {
    case 'EN_ROUTE':
      return origin && haversineMeters(pos, origin) <= ARRIVE_RADIUS_M ? 'ARRIVED' : null;
    case 'ARRIVED':
      return origin && haversineMeters(pos, origin) >= LEAVE_RADIUS_M ? 'PICKED_UP' : null;
    case 'PICKED_UP':
      return dest && haversineMeters(pos, dest) <= ARRIVE_RADIUS_M ? 'COMPLETED' : null;
    default:
      return null;
  }
}

/** Change a trip's status and keep its driver's availability in step. */
export async function setTripStatus(trip: { id: string; driverId: string | null }, status: string) {
  const updated = await prisma.trip.update({
    where: { id: trip.id },
    data: { status },
    include: { driver: { include: { user: { select: { name: true, phone: true } } } }, vehicle: true },
  });
  if (trip.driverId) {
    if (status === 'EN_ROUTE' || status === 'ARRIVED' || status === 'PICKED_UP') {
      await prisma.driver.update({ where: { id: trip.driverId }, data: { status: 'ON_TRIP' } });
    } else if (status === 'COMPLETED' || status === 'CANCELLED') {
      await prisma.driver.update({ where: { id: trip.driverId }, data: { status: 'AVAILABLE' } });
    }
  }
  return updated;
}

/**
 * Called with every position a driver reports. Returns the new status of the first trip that moved on, or null.
 * Every active trip of the driver is looked at, not just the oldest: a trip that was started and never finished
 * (a forgotten "on the way") must not swallow the position updates of the trip the driver is really on.
 */
export async function progressTripFromPosition(
  driverId: string,
  pos: { lat: number; lng: number; accuracy?: number | null },
): Promise<{ tripId: string; status: string } | null> {
  const trips = await prisma.trip.findMany({
    where: { driverId, status: { in: ACTIVE_STATUSES } },
    orderBy: { scheduledAt: 'asc' },
  });
  let first: { tripId: string; status: string } | null = null;
  for (const trip of trips) {
    const next = nextAutoStatus(trip, pos);
    if (!next) continue;
    await setTripStatus(trip, next);
    first ??= { tripId: trip.id, status: next };
  }
  return first;
}
