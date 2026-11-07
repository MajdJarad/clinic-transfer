import type { TripStatus } from '../types';

/** The driver's next step for a trip, by its current status. */
export const NEXT_ACTION: Partial<Record<TripStatus, { label: string; status: TripStatus }>> = {
  ASSIGNED: { label: 'انطلاق في الطريق 🚗', status: 'EN_ROUTE' },
  EN_ROUTE: { label: 'وصلت إلى الموقع 📍', status: 'ARRIVED' },
  ARRIVED: { label: 'صعد المريض 👤', status: 'PICKED_UP' },
  PICKED_UP: { label: 'إنهاء الرحلة بنجاح ✓', status: 'COMPLETED' },
};

/** A finished or cancelled trip has nothing left to navigate. */
export const isOpenTrip = (status: TripStatus) => status !== 'COMPLETED' && status !== 'CANCELLED';
