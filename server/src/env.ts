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

  // --- Maps: everything (map, routes, place search, traffic) uses GOOGLE_MAPS_API_KEY ---
  // Optional: a Google Cloud *Map ID* (vector map) enables heading-up + tilt while navigating.
  googleMapId: process.env.GOOGLE_MAP_ID ?? '',
  // --- WhatsApp Cloud API (optional): lets the SERVER message a patient on a driver's behalf, so the
  // driver never sees the number. Without it, the driver's request goes to the coordinator instead.
  whatsappToken: process.env.WHATSAPP_CLOUD_TOKEN ?? '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  // Business-initiated messages need an approved template; empty = send plain text (only works inside
  // WhatsApp's 24-hour window, fine for testing).
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME ?? '',
  whatsappTemplateLang: process.env.WHATSAPP_TEMPLATE_LANG ?? 'ar',
  whatsappApiBase: (process.env.WHATSAPP_API_BASE ?? 'https://graph.facebook.com/v21.0').replace(/\/$/, ''),
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
export const whatsappCloudEnabled = Boolean(env.whatsappToken && env.whatsappPhoneNumberId);
export const googleMapsEnabled = Boolean(env.googleMapsApiKey);

export const isProd = env.nodeEnv === 'production';
