import type {
  ArrivalMessage,
  AuthUser,
  DashboardSummary,
  Driver,
  Maintenance,
  Patient,
  TrackingDriver,
  Trip,
  UserRecord,
  Vehicle,
} from './types';

const TOKEN_KEY = 'transfer_token';
const USER_KEY = 'transfer_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearSession();
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'Request failed');
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  config: () =>
    request<{
      mapProvider: string;
      googleMapsApiKey: string;
      traccarEnabled: boolean;
      defaultCenter: { lat: number; lng: number };
      defaultZoom: number;
    }>('/config'),

  geo: {
    route: (from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode = 'driving') =>
      request<{ distance: number; duration: number; geometry: { type: string; coordinates: [number, number][] } }>(
        `/geo/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&mode=${mode}`,
      ),
    search: (q: string, limit = 6) =>
      request<{ label: string; lat: number; lng: number }[]>(
        `/geo/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      ),
  },

  dashboard: () => request<DashboardSummary>('/dashboard/summary'),

  users: {
    list: () => request<UserRecord[]>('/users'),
    create: (data: Record<string, unknown>) =>
      request<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<UserRecord>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  drivers: {
    list: () => request<Driver[]>('/drivers'),
    me: (id: string) => request<Driver>(`/drivers/${id}`),
    setStatus: (id: string, status: string) =>
      request<Driver>(`/drivers/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    sendLocation: (id: string, lat: number, lng: number) =>
      request(`/drivers/${id}/location`, {
        method: 'POST',
        body: JSON.stringify({ lat, lng }),
      }),
    live: () => request<TrackingDriver[]>('/drivers/tracking/live'),
    linkTraccar: (id: string, traccarDeviceId: string | null) =>
      request<Driver>(`/drivers/${id}/traccar`, {
        method: 'PATCH',
        body: JSON.stringify({ traccarDeviceId }),
      }),
  },

  vehicles: {
    list: () => request<Vehicle[]>('/vehicles'),
    create: (data: Record<string, unknown>) =>
      request<Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    assign: (id: string, driverId: string | null) =>
      request<Vehicle>(`/vehicles/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ driverId }),
      }),
    delete: (id: string) => request<void>(`/vehicles/${id}`, { method: 'DELETE' }),
  },

  patients: {
    list: (q = '') => request<Patient[]>(`/patients?q=${encodeURIComponent(q)}`),
    create: (data: Record<string, unknown>) =>
      request<Patient>('/patients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Patient>(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },

  trips: {
    list: (params: Record<string, string> = {}) =>
      request<Trip[]>(`/trips?${new URLSearchParams(params).toString()}`),
    mine: () => request<Trip[]>('/trips/mine'),
    create: (data: Record<string, unknown>) =>
      request<Trip>('/trips', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Trip>(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    assign: (id: string, driverId: string | null, vehicleId?: string | null) =>
      request<Trip>(`/trips/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ driverId, vehicleId }),
      }),
    setStatus: (id: string, status: string) =>
      request<Trip>(`/trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    cancel: (id: string) => request<Trip>(`/trips/${id}/cancel`, { method: 'POST' }),
    arrivalMessage: (id: string) => request<ArrivalMessage>(`/trips/${id}/arrival-message`),
  },

  maintenance: {
    list: () => request<Maintenance[]>('/maintenance'),
    create: (data: Record<string, unknown>) =>
      request<Maintenance>('/maintenance', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Maintenance>(`/maintenance/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    complete: (id: string) => request<Maintenance>(`/maintenance/${id}/complete`, { method: 'POST' }),
  },
};
