import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, HttpError } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { ACTIVE_STATUSES } from '../lib/tripProgress';
import { authenticate, requireRole } from '../middleware/auth';

export const alertsRouter = Router();

alertsRouter.use(authenticate);

export const ALERT_TYPES = ['PATIENT', 'VEHICLE', 'ACCIDENT', 'OTHER'] as const;

const createSchema = z.object({
  type: z.enum(ALERT_TYPES),
  note: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

const include = { driver: { include: { user: { select: { name: true, phone: true } }, vehicle: true } } } as const;

type AlertRow = Awaited<ReturnType<typeof prisma.alert.findFirstOrThrow<{ include: typeof include }>>>;

/** What the app needs to show an alert. Never includes a patient's phone number. */
async function toDto(rows: AlertRow[]) {
  const tripIds = rows.map((r) => r.tripId).filter((x): x is string => !!x);
  const trips = tripIds.length
    ? await prisma.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, status: true, patientName: true, origin: true, destination: true } })
    : [];
  const byId = new Map(trips.map((t) => [t.id, t]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    note: r.note,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    createdAt: r.createdAt,
    acknowledgedAt: r.acknowledgedAt,
    acknowledgedBy: r.acknowledgedBy,
    resolvedAt: r.resolvedAt,
    resolvedBy: r.resolvedBy,
    driver: {
      id: r.driverId,
      name: r.driver.user.name,
      phone: r.driver.user.phone,
      vehicle: r.driver.vehicle ? { make: r.driver.vehicle.make, model: r.driver.vehicle.model, plate: r.driver.vehicle.plate } : null,
    },
    trip: r.tripId ? (byId.get(r.tripId) ?? null) : null,
  }));
}

// A driver raises an urgent alert (problem with the patient or the car, accident...). It is stamped with
// the driver's position and current trip. Sending the same kind twice within 20 s returns the first one.
alertsRouter.post(
  '/',
  requireRole('DRIVER'),
  rateLimit({ windowMs: 60_000, max: 8 }),
  asyncHandler(async (req, res) => {
    const driverId = req.user!.driverId;
    if (!driverId) throw new HttpError(403, 'No driver profile linked to this account');
    const body = createSchema.parse(req.body);

    const recent = await prisma.alert.findFirst({
      where: { driverId, type: body.type, status: { not: 'RESOLVED' }, createdAt: { gte: new Date(Date.now() - 20_000) } },
      include,
    });
    if (recent) return res.status(200).json((await toDto([recent]))[0]);

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    const trip = await prisma.trip.findFirst({ where: { driverId, status: { in: ACTIVE_STATUSES } }, orderBy: { scheduledAt: 'asc' } });
    const created = await prisma.alert.create({
      data: {
        driverId,
        tripId: trip?.id ?? null,
        type: body.type,
        note: body.note || null,
        lat: body.lat ?? driver?.lat ?? null,
        lng: body.lng ?? driver?.lng ?? null,
      },
      include,
    });
    res.status(201).json((await toDto([created]))[0]);
  }),
);

// Alerts nobody has resolved yet (default), or everything recent with ?status=all.
alertsRouter.get(
  '/',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const all = req.query.status === 'all';
    const rows = await prisma.alert.findMany({
      where: all ? {} : { status: { not: 'RESOLVED' } },
      include,
      orderBy: { createdAt: 'desc' },
      take: all ? 200 : 50,
    });
    res.json(await toDto(rows));
  }),
);

// A driver's own recent alerts, so the app can show "the coordinator has taken it over".
alertsRouter.get(
  '/mine',
  requireRole('DRIVER'),
  asyncHandler(async (req, res) => {
    const driverId = req.user!.driverId;
    if (!driverId) return res.json([]);
    const rows = await prisma.alert.findMany({ where: { driverId }, include, orderBy: { createdAt: 'desc' }, take: 5 });
    res.json(await toDto(rows));
  }),
);

async function userName(id: string) {
  return (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

alertsRouter.patch(
  '/:id/ack',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const found = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!found) throw new HttpError(404, 'Alert not found');
    if (found.status !== 'OPEN') return res.json((await toDto([await prisma.alert.findUniqueOrThrow({ where: { id: found.id }, include })]))[0]);
    const row = await prisma.alert.update({
      where: { id: found.id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedBy: await userName(req.user!.sub) },
      include,
    });
    res.json((await toDto([row]))[0]);
  }),
);

alertsRouter.patch(
  '/:id/resolve',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const found = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!found) throw new HttpError(404, 'Alert not found');
    const name = await userName(req.user!.sub);
    const row = await prisma.alert.update({
      where: { id: found.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: name,
        // resolving implies it was seen
        ...(found.acknowledgedAt ? {} : { acknowledgedAt: new Date(), acknowledgedBy: name }),
      },
      include,
    });
    res.json((await toDto([row]))[0]);
  }),
);
