import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { authenticate } from '../middleware/auth';
import {
  assertGoogleConfigured,
  autocompletePlaces,
  computeRoutes,
  getPlace,
  reverseGeocode,
} from '../services/google';

export const geoRouter = Router();

geoRouter.use(authenticate);

const coord = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'must be "lat,lng"')
  .transform((v) => {
    const [lat, lng] = v.split(',').map(Number);
    return { lat, lng };
  })
  .refine((c) => Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180, 'coordinate out of range');

const flag = z
  .enum(['0', '1'])
  .optional()
  .transform((v) => v === '1');
const session = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,36}$/)
  .optional();

const routeQuery = z.object({
  from: coord,
  to: coord,
  mode: z.enum(['driving', 'walking']).default('driving'),
  // alternatives is on unless explicitly "0"
  alt: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v !== '0'),
  tolls: flag, // avoid tolls
  highways: flag, // avoid highways
  ferries: flag, // avoid ferries
});

// Route(s) with turn-by-turn steps and traffic. Example:
//   /api/geo/route?from=41.0082,28.9784&to=41.0422,29.0094&mode=driving&alt=1&tolls=1
// The first route is also flattened onto the top level of the response.
geoRouter.get(
  '/route',
  asyncHandler(async (req, res) => {
    const q = routeQuery.parse(req.query);
    const routes = await computeRoutes(q.from, q.to, {
      mode: q.mode,
      alternatives: q.alt,
      avoidTolls: q.tolls,
      avoidHighways: q.highways,
      avoidFerries: q.ferries,
    });
    res.json({ ...routes[0], routes });
  }),
);

// Search-as-you-type suggestions.
geoRouter.get(
  '/autocomplete',
  asyncHandler(async (req, res) => {
    const q = z.object({ q: z.string().trim().max(200), session }).parse(req.query);
    assertGoogleConfigured();
    if (q.q.length < 2) return res.json([]);
    res.json(await autocompletePlaces(q.q, q.session));
  }),
);

// Resolve a suggestion to coordinates.
geoRouter.get(
  '/place/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, 'Invalid place id').parse(req.params.id);
    const q = z.object({ session }).parse(req.query);
    res.json(await getPlace(id, q.session));
  }),
);

// Address for a point picked on the map. Always answers with a usable label.
geoRouter.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const q = z.object({ at: coord }).parse(req.query);
    let label: string | null = null;
    try {
      label = await reverseGeocode(q.at);
    } catch {
      /* fall through to the coordinate label */
    }
    res.json({
      label: label ?? `الموقع المحدد (${q.at.lat.toFixed(5)}, ${q.at.lng.toFixed(5)})`,
      lat: q.at.lat,
      lng: q.at.lng,
      resolved: label !== null,
    });
  }),
);
