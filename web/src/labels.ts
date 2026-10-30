import type {
  DriverStatus,
  MaintenanceStatus,
  MaintenanceType,
  TripStatus,
  TripType,
  VehicleStatus,
} from './types';

export const tripTypeKeys: Record<TripType, string> = {
  AIRPORT_TO_HOTEL: 'tripType.AIRPORT_TO_HOTEL',
  HOTEL_TO_AIRPORT: 'tripType.HOTEL_TO_AIRPORT',
  HOTEL_TO_CLINIC: 'tripType.HOTEL_TO_CLINIC',
  CLINIC_TO_HOTEL: 'tripType.CLINIC_TO_HOTEL',
};

export const tripStatusKeys: Record<TripStatus, string> = {
  SCHEDULED: 'tripStatus.SCHEDULED',
  ASSIGNED: 'tripStatus.ASSIGNED',
  EN_ROUTE: 'tripStatus.EN_ROUTE',
  ARRIVED: 'tripStatus.ARRIVED',
  PICKED_UP: 'tripStatus.PICKED_UP',
  COMPLETED: 'tripStatus.COMPLETED',
  CANCELLED: 'tripStatus.CANCELLED',
};

export const driverStatusKeys: Record<DriverStatus, string> = {
  AVAILABLE: 'driverStatus.AVAILABLE',
  ON_TRIP: 'driverStatus.ON_TRIP',
  OFFLINE: 'driverStatus.OFFLINE',
};

export const vehicleStatusKeys: Record<VehicleStatus, string> = {
  ACTIVE: 'vehicleStatus.ACTIVE',
  MAINTENANCE: 'vehicleStatus.MAINTENANCE',
  OUT_OF_SERVICE: 'vehicleStatus.OUT_OF_SERVICE',
};

export const maintenanceTypeKeys: Record<MaintenanceType, string> = {
  ROUTINE: 'maintenanceType.ROUTINE',
  REPAIR: 'maintenanceType.REPAIR',
  INSPECTION: 'maintenanceType.INSPECTION',
};

export const maintenanceStatusKeys: Record<MaintenanceStatus, string> = {
  SCHEDULED: 'maintenanceStatus.SCHEDULED',
  IN_PROGRESS: 'maintenanceStatus.IN_PROGRESS',
  DONE: 'maintenanceStatus.DONE',
};

export const roleKeys: Record<string, string> = {
  ADMIN: 'role.ADMIN',
  COORDINATOR: 'role.COORDINATOR',
  DRIVER: 'role.DRIVER',
};

export const weekdayKeys = [
  'weekday.0',
  'weekday.1',
  'weekday.2',
  'weekday.3',
  'weekday.4',
  'weekday.5',
  'weekday.6',
];

export const weekdayShortKeys = [
  'weekdayShort.0',
  'weekdayShort.1',
  'weekdayShort.2',
  'weekdayShort.3',
  'weekdayShort.4',
  'weekdayShort.5',
  'weekdayShort.6',
];
