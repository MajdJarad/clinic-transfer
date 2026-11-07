import { Router } from 'express';
import { z } from 'zod';
import { tripTypeSchema, tripStatusSchema } from '../constants';
import { prisma } from '../db';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';
import { redactPatientPhone } from '../lib/privacy';
import { ACTIVE_STATUSES, setTripStatus } from '../lib/tripProgress';
import { getSettings } from '../lib/settings';
import { whatsappCloudEnabled } from '../env';
import { sendWhatsAppMessage } from '../services/whatsappCloud';
import { buildArrivalMessage, buildWhatsAppLink, canonicalPhone, isValidInternationalPhone, normalizePhone } from '../lib/whatsapp';

export const tripsRouter = Router();

tripsRouter.use(authenticate);

// A driver never receives a patient's phone number, from any trip endpoint.
tripsRouter.use((req, res, next) => {
  if (req.user?.role === 'DRIVER') {
    const send = res.json.bind(res);
    res.json = (body: unknown) => send(redactPatientPhone(body));
  }
  next();
});

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
  // Typed with the international prefix (e.g. +905331234567); nothing is ever added automatically.
  patientPhone: z
    .string()
    .refine(isValidInternationalPhone, 'رقم المريض يجب أن يُكتب مع رمز الدولة (مثل +905331234567)')
    .transform(canonicalPhone),
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

// Coordinators and admins can set any status by hand. Drivers cannot: a trip follows their live
// position (see lib/tripProgress.ts), and their only action is "Go" below.
tripsRouter.patch(
  '/:id/status',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) throw new HttpError(404, 'Trip not found');
    res.json(await setTripStatus(trip, status));
  }),
);

// The driver sets off towards the patient ("Go"): ASSIGNED -> EN_ROUTE. From there the position does the rest.
tripsRouter.post(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) throw new HttpError(404, 'Trip not found');
    if (req.user!.role === 'DRIVER' && trip.driverId !== req.user!.driverId) throw new HttpError(403, 'Insufficient permissions');
    if (trip.status === 'ASSIGNED') return res.json(await setTripStatus(trip, 'EN_ROUTE'));
    if (ACTIVE_STATUSES.includes(trip.status)) {
      return res.json(await prisma.trip.findUnique({ where: { id: trip.id }, include: tripInclude })); // already under way
    }
    throw new HttpError(400, 'لا يمكن بدء هذه الرحلة في حالتها الحالية');
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
    if (req.user!.role === 'DRIVER') {
      // Drivers do not contact patients: only the coordinator sees the number and sends this message.
      throw new HttpError(403, 'Insufficient permissions');
    }
    if (!trip.driver || !trip.vehicle) {
      throw new HttpError(400, 'Trip has no assigned driver/vehicle yet');
    }

    // The message text is admin-editable (Administration > Messages).
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
      normalizedPhone: normalizePhone(trip.patientPhone),
      // false for a number saved without its country code (nothing is guessed): it must be edited first
      phoneValid: isValidInternationalPhone(trip.patientPhone),
      text,
      link: buildWhatsAppLink(trip.patientPhone, text),
    });
  }),
);

// Delete a trip for good. Drivers cannot; the web app asks for confirmation first.
tripsRouter.delete(
  '/:id',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) throw new HttpError(404, 'Trip not found');
    await prisma.trip.delete({ where: { id: trip.id } });

    // A driver who was on this trip is free again, unless another trip of theirs is still in progress.
    if (trip.driverId && ACTIVE_STATUSES.includes(trip.status)) {
      const stillBusy = await prisma.trip.count({ where: { driverId: trip.driverId, status: { in: ACTIVE_STATUSES } } });
      if (!stillBusy) await prisma.driver.update({ where: { id: trip.driverId }, data: { status: 'AVAILABLE' } });
    }
    res.status(204).end();
  }),
);

// Tell the patient the car has arrived. Meant for the driver, who must not see the number: the
// server sends the message itself (WhatsApp Cloud API) and the number never leaves it. While sending
// is not configured, the request is recorded and the coordinator, who can see the number, sends it.
tripsRouter.post(
  '/:id/notify-patient',
  asyncHandler(async (req, res) => {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id }, include: tripInclude });
    if (!trip) throw new HttpError(404, 'Trip not found');
    if (req.user!.role === 'DRIVER' && trip.driverId !== req.user!.driverId) throw new HttpError(403, 'Insufficient permissions');
    if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') throw new HttpError(400, 'الرحلة منتهية');
    if (!trip.driver || !trip.vehicle) throw new HttpError(400, 'Trip has no assigned driver/vehicle yet');

    // Do not message the patient twice by accident (a double tap).
    if (trip.patientNoticeSentAt && Date.now() - trip.patientNoticeSentAt.getTime() < 2 * 60_000) {
      return res.json({ status: 'already', at: trip.patientNoticeSentAt });
    }

    if (!whatsappCloudEnabled) {
      const at = new Date();
      await prisma.trip.update({ where: { id: trip.id }, data: { patientNoticeRequestedAt: at } });
      return res.json({ status: 'requested', at });
    }

    const settings = await getSettings();
    const vehicle = `${trip.vehicle.make} ${trip.vehicle.model}${trip.vehicle.color ? ` (${trip.vehicle.color})` : ''}`;
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
    await sendWhatsAppMessage({
      to: normalizePhone(trip.patientPhone),
      text,
      templateParams: [trip.patientName, vehicle, trip.vehicle.plate, trip.driver.user.name, trip.driver.user.phone ?? ''],
    });
    const at = new Date();
    await prisma.trip.update({ where: { id: trip.id }, data: { patientNoticeSentAt: at, patientNoticeRequestedAt: null } });
    res.json({ status: 'sent', at });
  }),
);

// The coordinator has sent the message by hand (WhatsApp link): clear the driver's request.
tripsRouter.post(
  '/:id/patient-notice/sent',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const trip = await prisma.trip.update({
      where: { id: req.params.id },
      data: { patientNoticeSentAt: new Date(), patientNoticeRequestedAt: null },
      include: tripInclude,
    });
    res.json(trip);
  }),
);
