import { Router } from 'express';
import { z } from 'zod';
import { driverStatusSchema } from '../constants';
import { prisma } from '../db';
import { traccarEnabled } from '../env';
import { asyncHandler, HttpError } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { fetchLatestPositions, parseDeviceId } from '../lib/traccar';
import { authenticate, requireRole } from '../middleware/auth';

export const driversRouter = Router();

driversRouter.use(authenticate);

const driverInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, active: true } },
  vehicle: true,
} as const;

driversRouter.get(
  '/',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (_req, res) => {
    const drivers = await prisma.driver.findMany({
      include: driverInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json(drivers);
  }),
);

driversRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const isSelf = req.user!.driverId === req.params.id;
    if (!isSelf && req.user!.role === 'DRIVER') {
      throw new HttpError(403, 'Insufficient permissions');
    }
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.id },
      include: driverInclude,
    });
    if (!driver) throw new HttpError(404, 'Driver not found');
    res.json(driver);
  }),
);

const statusSchema = z.object({
  status: driverStatusSchema,
});

driversRouter.patch(
  '/:id/status',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { status },
      include: driverInclude,
    });
    res.json(driver);
  }),
);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).nullish(),
  speed: z.number().min(0).max(100).nullish(), // m/s, as the browser reports it
  accuracy: z.number().min(0).nullish(),
});

driversRouter.post(
  '/:id/location',
  // A phone reports every few seconds; this only stops a runaway client.
  rateLimit({ windowMs: 60_000, max: 150 }),
  asyncHandler(async (req, res) => {
    const isSelf = req.user!.driverId === req.params.id;
    if (!isSelf && req.user!.role !== 'ADMIN') {
      throw new HttpError(403, 'Insufficient permissions');
    }
    const { lat, lng, heading, speed, accuracy } = locationSchema.parse(req.body);
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: {
        lat,
        lng,
        heading: heading ?? null,
        speedKmh: speed != null ? Math.round(speed * 3.6 * 10) / 10 : null,
        accuracy: accuracy ?? null,
        lastSeen: new Date(),
      },
      select: { id: true, lat: true, lng: true, lastSeen: true },
    });
    res.json(driver);
  }),
);

// Link (or unlink) a Traccar device to a driver, for hardware/phone trackers.
const traccarSchema = z.object({
  traccarDeviceId: z.string().nullable(),
});

driversRouter.patch(
  '/:id/traccar',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const { traccarDeviceId } = traccarSchema.parse(req.body);
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { traccarDeviceId },
      include: driverInclude,
    });
    res.json(driver);
  }),
);

// Live tracking feed for coordinators/admins (polled by the dashboard).
// Positions come from either the driver's browser/phone GPS or a Traccar device.
driversRouter.get(
  '/tracking/live',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (_req, res) => {
    const drivers = await prisma.driver.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        vehicle: { select: { make: true, model: true, plate: true } },
      },
    });

    let traccar = new Map<number, { latitude: number; longitude: number; deviceTime?: string; fixTime?: string }>();
    if (traccarEnabled) {
      try {
        traccar = await fetchLatestPositions();
      } catch {
        // Traccar unreachable: fall back to stored positions.
        traccar = new Map();
      }
    }

    // The trip each driver is on right now (never includes the patient's phone).
    const active = await prisma.trip.findMany({
      where: { driverId: { in: drivers.map((d) => d.id) }, status: { in: ['EN_ROUTE', 'ARRIVED', 'PICKED_UP'] } },
      select: { id: true, driverId: true, status: true, patientName: true, origin: true, destination: true },
      orderBy: { scheduledAt: 'desc' },
    });
    const tripOf = new Map<string, (typeof active)[number]>();
    for (const t of active) if (t.driverId && !tripOf.has(t.driverId)) tripOf.set(t.driverId, t);

    const now = Date.now();
    const result = drivers.map((d) => {
      const deviceId = parseDeviceId(d.traccarDeviceId);
      const pos = deviceId != null ? traccar.get(deviceId) : undefined;
      const seen = pos?.fixTime ?? pos?.deviceTime;
      const lastSeen = seen ? new Date(seen) : d.lastSeen;
      return {
        id: d.id,
        name: d.user.name,
        phone: d.user.phone,
        status: d.status,
        lat: pos ? pos.latitude : d.lat,
        lng: pos ? pos.longitude : d.lng,
        heading: pos ? null : d.heading,
        speedKmh: pos ? null : d.speedKmh,
        accuracy: pos ? null : d.accuracy,
        lastSeen,
        // seconds since the last position, computed here so the screen does not depend on its own clock
        ageSeconds: lastSeen ? Math.max(0, Math.round((now - lastSeen.getTime()) / 1000)) : null,
        source: pos ? 'traccar' : 'phone',
        vehicle: d.vehicle,
        activeTrip: tripOf.get(d.id) ? { ...tripOf.get(d.id)!, driverId: undefined } : null,
      };
    });

    res.json(result);
  }),
);
