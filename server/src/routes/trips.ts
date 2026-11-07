import { Router } from 'express';
import { z } from 'zod';
import { tripTypeSchema, tripStatusSchema } from '../constants';
import { prisma } from '../db';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';
import { getSettings } from '../lib/settings';
import { buildArrivalMessage, buildWhatsAppLink, normalizePhone } from '../lib/whatsapp';

export const tripsRouter = Router();

tripsRouter.use(authenticate);

const tripInclude = {
  driver: { include: { user: { select: { name: true, phone: true } } } },
  vehicle: true,
} as const;

tripsRouter.get(
  '/',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const { status, driverId, date, from, to } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof status === 'string' && status) where.status = status;
    if (typeof driverId === 'string' && driverId) where.driverId = driverId;
    if (typeof from === 'string' && typeof to === 'string' && from && to) {
      const start = new Date(from);
      const end = new Date(to);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        where.scheduledAt = { gte: start, lt: end };
      }
    } else if (typeof date === 'string' && date) {
      const start = new Date(date);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.scheduledAt = { gte: start, lt: end };
      }
    }
    const trips = await prisma.trip.findMany({
      where,
      include: tripInclude,
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
    res.json(trips);
  }),
);

// Trips assigned to the authenticated driver.
tripsRouter.get(
  '/mine',
  requireRole('DRIVER'),
  asyncHandler(async (req, res) => {
    const driverId = req.user!.driverId;
    if (!driverId) throw new HttpError(403, 'No driver profile linked to this account');
    const trips = await prisma.trip.findMany({
      where: { driverId, status: { not: 'CANCELLED' } },
      include: tripInclude,
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(trips);
  }),
);

tripsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: tripInclude,
    });
    if (!trip) throw new HttpError(404, 'Trip not found');
    if (req.user!.role === 'DRIVER' && trip.driverId !== req.user!.driverId) {
      throw new HttpError(403, 'Insufficient permissions');
    }
    res.json(trip);
  }),
);

const lat = z.number().min(-90).max(90).nullish();
const lng = z.number().min(-180).max(180).nullish();

const createSchema = z.object({
  patientName: z.string().min(1),
  patientPhone: z.string().min(3),
  type: tripTypeSchema,
  origin: z.string().min(1),
  destination: z.string().min(1),
  originLat: lat,
  originLng: lng,
  destLat: lat,
  destLng: lng,
  scheduledAt: z.coerce.date(),
  endAt: z.coerce.date().nullish(),
  driverId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  notes: z.string().optional(),
});

tripsRouter.post(
  '/',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const endAt =
      data.endAt ?? new Date(data.scheduledAt.getTime() + 60 * 60 * 1000);
    const trip = await prisma.trip.create({
      data: {
        patientName: data.patientName,
        patientPhone: data.patientPhone,
        type: data.type,
        origin: data.origin,
        destination: data.destination,
        originLat: data.originLat,
        originLng: data.originLng,
        destLat: data.destLat,
        destLng: data.destLng,
        scheduledAt: data.scheduledAt,
        endAt,
        notes: data.notes,
        driverId: data.driverId ?? undefined,
        vehicleId: data.vehicleId ?? undefined,
        status: data.driverId ? 'ASSIGNED' : 'SCHEDULED',
        createdById: req.user!.sub,
      },
      include: tripInclude,
    });
    res.status(201).json(trip);
  }),
);

const updateSchema = createSchema.partial();

tripsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const trip = await prisma.trip.update({
      where: { id: req.params.id },
      data,
      include: tripInclude,
    });
    res.json(trip);
  }),
);

// Assign (or re-assign) a driver + vehicle. Vehicle defaults to the driver's vehicle.
const assignSchema = z.object({
  driverId: z.string().nullable(),
  vehicleId: z.string().nullish(),
});

tripsRouter.patch(
  '/:id/assign',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const { driverId, vehicleId } = assignSchema.parse(req.body);
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) throw new HttpError(404, 'Trip not found');

    let resolvedVehicleId = vehicleId ?? null;
    if (driverId && !resolvedVehicleId) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        include: { vehicle: true },
      });
      if (!driver) throw new HttpError(404, 'Driver not found');
      resolvedVehicleId = driver.vehicle?.id ?? null;
    }

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: {
        driverId,
        vehicleId: resolvedVehicleId,
        status: driverId ? 'ASSIGNED' : 'SCHEDULED',
      },
      include: tripInclude,
    });
    res.json(updated);
  }),
);

const statusSchema = z.object({ status: tripStatusSchema });

tripsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) throw new HttpError(404, 'Trip not found');
    if (req.user!.role === 'DRIVER' && trip.driverId !== req.user!.driverId) {
      throw new HttpError(403, 'Insufficient permissions');
    }

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: { status },
      include: tripInclude,
    });

    // Keep driver availability in sync with trip progress.
    if (trip.driverId) {
      if (status === 'EN_ROUTE' || status === 'ARRIVED') {
        await prisma.driver.update({
          where: { id: trip.driverId },
          data: { status: 'ON_TRIP' },
        });
      } else if (status === 'COMPLETED' || status === 'CANCELLED') {
        await prisma.driver.update({
          where: { id: trip.driverId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    res.json(updated);
  }),
);

// Cancel a trip (soft status change, nothing is deleted).
tripsRouter.post(
  '/:id/cancel',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const updated = await prisma.trip.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: tripInclude,
    });
    // Same as PATCH /:id/status: a cancelled trip releases its driver.
    if (updated.driverId) {
      await prisma.driver.update({
        where: { id: updated.driverId },
        data: { status: 'AVAILABLE' },
      });
    }
    res.json(updated);
  }),
);

// Ready-to-send WhatsApp text + deep link. No WhatsApp API is used:
// the coordinator opens the link, WhatsApp prefills the message, they press send.
tripsRouter.get(
  '/:id/arrival-message',
  asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: tripInclude,
    });
    if (!trip) throw new HttpError(404, 'Trip not found');
    if (req.user!.role === 'DRIVER' && trip.driverId !== req.user!.driverId) {
      throw new HttpError(403, 'Insufficient permissions');
    }
    if (!trip.driver || !trip.vehicle) {
      throw new HttpError(400, 'Trip has no assigned driver/vehicle yet');
    }

    // Template and country code are admin-editable (Administration > Messages / Settings).
    const settings = await getSettings();
    const text = buildArrivalMessage(
      {
        patientName: trip.patientName,
        vehicleMake: trip.vehicle.make,
        vehicleModel: trip.vehicle.model,
        vehiclePlate: trip.vehicle.plate,
        vehicleColor: trip.vehicle.color,
        driverName: trip.driver.user.name,
        driverPhone: trip.driver.user.phone,
      },
      settings.whatsappTemplate,
    );

    res.json({
      phone: trip.patientPhone,
      normalizedPhone: normalizePhone(trip.patientPhone, settings.defaultCountryCode),
      text,
      link: buildWhatsAppLink(trip.patientPhone, text, settings.defaultCountryCode),
    });
  }),
);
