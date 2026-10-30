import { Router } from 'express';
import { z } from 'zod';
import { vehicleStatusSchema } from '../constants';
import { prisma } from '../db';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate);

const vehicleInclude = {
  driver: { include: { user: { select: { name: true, phone: true } } } },
} as const;

vehiclesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      include: vehicleInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json(vehicles);
  }),
);

const createSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  plate: z.string().min(1),
  color: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

vehiclesRouter.post(
  '/',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const vehicle = await prisma.vehicle.create({ data, include: vehicleInclude });
    res.status(201).json(vehicle);
  }),
);

const updateSchema = createSchema.partial().extend({
  status: vehicleStatusSchema.optional(),
});

vehiclesRouter.patch(
  '/:id',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data,
      include: vehicleInclude,
    });
    res.json(vehicle);
  }),
);

const assignSchema = z.object({
  driverId: z.string().nullable(),
});

// Assign a vehicle to a driver, or detach it (driverId: null).
vehiclesRouter.patch(
  '/:id/assign',
  requireRole('ADMIN', 'COORDINATOR'),
  asyncHandler(async (req, res) => {
    const { driverId } = assignSchema.parse(req.body);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!vehicle) throw new HttpError(404, 'Vehicle not found');

    if (driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: driverId } });
      if (!driver) throw new HttpError(404, 'Driver not found');
      const occupied = await prisma.vehicle.findFirst({
        where: { driverId, id: { not: vehicle.id } },
      });
      if (occupied) {
        throw new HttpError(409, 'Driver already assigned to another vehicle');
      }
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { driverId },
      include: vehicleInclude,
    });
    res.json(updated);
  }),
);

vehiclesRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
