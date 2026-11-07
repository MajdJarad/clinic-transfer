import type { TripStatus } from '../types';

/** A finished or cancelled trip has nothing left to navigate. */
export const isOpenTrip = (status: TripStatus) => status !== 'COMPLETED' && status !== 'CANCELLED';
