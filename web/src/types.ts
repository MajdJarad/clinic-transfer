export type Role = 'ADMIN' | 'COORDINATOR' | 'DRIVER';

export type DriverStatus = 'AVAILABLE' | 'ON_TRIP' | 'OFFLINE';
export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
export type TripType =
  | 'AIRPORT_TO_HOTEL'
  | 'HOTEL_TO_AIRPORT'
  | 'HOTEL_TO_CLINIC'
  | 'CLINIC_TO_HOTEL';
export type TripStatus =
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED';
export type MaintenanceType = 'ROUTINE' | 'REPAIR' | 'INSPECTION';
export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'DONE';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  driverId: string | null;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  driver?: { id: string; status: DriverStatus } | null;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  plate: string;
  color: string | null;
  capacity: number;
  status: VehicleStatus;
  driverId: string | null;
  driver?: {
    id: string;
    user: { name: string; phone: string | null };
  } | null;
}

export interface Driver {
  id: string;
  licenseNo: string | null;
  status: DriverStatus;
  lat: number | null;
  lng: number | null;
  lastSeen: string | null;
  user: { id: string; name: string; email: string; phone: string | null; active: boolean };
  vehicle?: Vehicle | null;
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  nationalId: string | null;
  notes: string | null;
}

export interface Trip {
  id: string;
  type: TripType;
  origin: string;
  destination: string;
  originLat: number | null;
  originLng: number | null;
  destLat: number | null;
  destLng: number | null;
  scheduledAt: string;
  endAt: string | null;
  status: TripStatus;
  notes: string | null;
  patientName: string;
  patientPhone: string;
  driverId: string | null;
  vehicleId: string | null;
  driver: Driver | null;
  vehicle: Vehicle | null;
}

export interface Maintenance {
  id: string;
  vehicleId: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  title: string;
  description: string | null;
  cost: number | null;
  odometer: number | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  vehicle: { id: string; make: string; model: string; plate: string };
}

export interface TrackingDriver {
  id: string;
  name: string;
  phone: string | null;
  status: DriverStatus;
  lat: number | null;
  lng: number | null;
  lastSeen: string | null;
  source?: 'phone' | 'traccar';
  vehicle: { make: string; model: string; plate: string } | null;
}

export interface DashboardSummary {
  drivers: { total: number; available: number };
  vehicles: { total: number; inMaintenance: number };
  trips: { today: number; active: number; completedToday: number };
  maintenance: { open: number };
}

export interface ArrivalMessage {
  phone: string;
  normalizedPhone: string;
  text: string;
  link: string;
}

// Admin-editable settings, stored on the server (see Administration).
export interface AppSettings {
  clinicName: string;
  defaultCountryCode: string;
  whatsappTemplate: string;
  mapCenterLat: number;
  mapCenterLng: number;
  mapZoom: number;
}

export interface SystemInfo {
  version: string;
  environment: string;
  node: string;
  uptimeSeconds: number;
  database: { provider: string; file: string; mayBeEphemeral: boolean };
  google: { mapsConfigured: boolean; mapIdConfigured: boolean };
  traccarEnabled: boolean;
}
