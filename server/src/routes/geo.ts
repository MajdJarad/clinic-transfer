import { Router } from 'express';
import { env } from '../env';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate } from '../middleware/auth';

export const geoRouter = Router();

geoRouter.use(authenticate);

// Real driving route via OSRM (OpenStreetMap road network). Free and keyless.
// Example: /api/geo/route?from=41.0082,28.9784&to=41.0422,29.0094
geoRouter.get(
  '/route',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) throw new HttpError(400, 'from and to are required as "lat,lng"');

    const parse = (v: string): [number, number] => {
      const [lat, lng] = v.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'Invalid coordinate');
      return [lat, lng];
    };
    const [fromLat, fromLng] = parse(from);
    const [toLat, toLng] = parse(to);

    // OSRM expects lon,lat order.
    const url = `${env.osrmUrl}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new HttpError(502, `Routing service error (${r.status})`);
      const data = (await r.json()) as {
        code: string;
        routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
      };
      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new HttpError(404, 'No route found');
      }
      const route = data.routes[0];
      res.json({
        distance: route.distance,
        duration: route.duration,
        geometry: { type: 'LineString', coordinates: route.geometry.coordinates },
      });
    } finally {
      clearTimeout(timer);
    }
  }),
);

// Real address search via Nominatim (OpenStreetMap). Works across Istanbul/Turkey.
geoRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as { q?: string; limit?: string };
    if (!q || q.trim().length < 2) return res.json([]);

    const url =
      `${env.nominatimUrl}/search?format=jsonv2&addressdetails=1&limit=${Number(limit) || 6}` +
      `&q=${encodeURIComponent(q)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'ClinicTransferApp/1.0 (patient-transfer)',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!r.ok) throw new HttpError(502, `Geocoding service error (${r.status})`);
      const items = (await r.json()) as { display_name: string; lat: string; lon: string }[];
      res.json(
        items.map((i) => ({
          label: i.display_name,
          lat: Number(i.lat),
          lng: Number(i.lon),
        })),
      );
    } finally {
      clearTimeout(timer);
    }
  }),
);
