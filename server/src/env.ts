import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: required('JWT_SECRET', 'dev-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? '',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE ?? '966',

  // --- Real map / routing / traffic (OpenStreetMap stack, no Google key needed) ---
  // OSRM routing engine (public demo by default; point to your own for production).
  osrmUrl: process.env.OSRM_URL ?? 'https://router.project-osrm.org',
  // Nominatim geocoding (address search) - OSM, free.
  nominatimUrl: process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
  // TomTom traffic-flow tiles (free tier, best Istanbul coverage). Optional.
  tomtomApiKey: process.env.TOMTOM_API_KEY ?? '',
  // Traccar is an open-source GPS tracking server (phones + hardware trackers).
  // Optional: when set, live positions are pulled from Traccar into the app.
  traccarUrl: (process.env.TRACCAR_URL ?? '').replace(/\/$/, ''),
  traccarToken: process.env.TRACCAR_TOKEN ?? '',
  traccarUser: process.env.TRACCAR_USER ?? '',
  traccarPassword: process.env.TRACCAR_PASSWORD ?? '',
  // Default map center: Istanbul.
  mapCenterLat: Number(process.env.MAP_CENTER_LAT ?? 41.0082),
  mapCenterLng: Number(process.env.MAP_CENTER_LNG ?? 28.9784),
  mapCenterZoom: Number(process.env.MAP_CENTER_ZOOM ?? 11),
};

export const traccarEnabled = Boolean(env.traccarUrl);
export const tomtomEnabled = Boolean(env.tomtomApiKey);

export const isProd = env.nodeEnv === 'production';
