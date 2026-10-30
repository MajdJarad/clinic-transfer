import { Router } from 'express';
import { z } from 'zod';
import { maintenanceTypeSchema, maintenanceStatusSchema } from '../constants';
import { prisma } from '../db';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate, requireRole('ADMIN', 'COORDINATOR', 'DRIVER'));

const include = {
  vehicle: { select: { id: true, make: true, model: true, plate: true } },
} as const;

maintenanceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { vehicleId, status } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof vehicleId === 'string' && vehicleId) where.vehicleId = vehicleId;
    if (typeof status === 'string' && status) where.status = status;

    if (req.user!.role === 'DRIVER') {
      const driver = await prisma.driver.findUnique({
        where: { id: req.user!.driverId ?? '' },
        include: { vehicle: true },
      });
      if (driver?.vehicle) {
        where.vehicleId = driver.vehicle.id;
      } else {
        return res.json([]);
      }
    }

    const records = await prisma.maintenance.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json(records);
  }),
);

const createSchema = z.object({
  vehicleId: z.string(),
  type: maintenanceTypeSchema,
  title: z.string().min(2),
  description: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  odometer: z.number().int().nonnegative().optional(),
  scheduledAt: z.coerce.date().optional(),
  status: maintenanceStatusSchema.optional(),
});

maintenanceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const record = await prisma.maintenance.create({ data, include });

    // A vehicle under active maintenance should not be dispatchable.
    if (record.status === 'IN_PROGRESS') {
      await prisma.vehicle.update({
        where: { id: data.vehicleId },
        data: { status: 'MAINTENANCE' },
      });
    }
    res.status(201).json(record);
  }),
);

const updateSchema = createSchema.partial();

maintenanceRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const record = await prisma.maintenance.update({
      where: { id: req.params.id },
      data,
      include,
    });
    if (data.status === 'IN_PROGRESS') {
      await prisma.vehicle.update({
        where: { id: record.vehicleId },
        data: { status: 'MAINTENANCE' },
      });
    }
    res.json(record);
  }),
);

maintenanceRouter.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const record = await prisma.maintenance.update({
      where: { id: req.params.id },
      data: { status: 'DONE', completedAt: new Date() },
      include,
    });
    // Return the vehicle to service.
    await prisma.vehicle.update({
      where: { id: record.vehicleId },
      data: { status: 'ACTIVE' },
    });
    res.json(record);
  }),
);
