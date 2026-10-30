import { z } from 'zod';

export const ROLES = ['ADMIN', 'COORDINATOR', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

export const DRIVER_STATUSES = ['AVAILABLE', 'ON_TRIP', 'OFFLINE'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];
export const driverStatusSchema = z.enum(DRIVER_STATUSES);

export const VEHICLE_STATUSES = ['ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export const vehicleStatusSchema = z.enum(VEHICLE_STATUSES);

export const TRIP_TYPES = [
  'AIRPORT_TO_HOTEL',
  'HOTEL_TO_AIRPORT',
  'HOTEL_TO_CLINIC',
  'CLINIC_TO_HOTEL',
] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const tripTypeSchema = z.enum(TRIP_TYPES);

export const TRIP_STATUSES = [
  'SCHEDULED',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export const tripStatusSchema = z.enum(TRIP_STATUSES);

export const MAINTENANCE_TYPES = ['ROUTINE', 'REPAIR', 'INSPECTION'] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export const maintenanceTypeSchema = z.enum(MAINTENANCE_TYPES);

export const MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'DONE'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export const maintenanceStatusSchema = z.enum(MAINTENANCE_STATUSES);
