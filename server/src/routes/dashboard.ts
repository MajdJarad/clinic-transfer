import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, requireRole('ADMIN', 'COORDINATOR'));

dashboardRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const [
      driversTotal,
      driversAvailable,
      vehiclesTotal,
      vehiclesInMaintenance,
      tripsToday,
      tripsActive,
      tripsCompletedToday,
      openMaintenance,
    ] = await Promise.all([
      prisma.driver.count(),
      prisma.driver.count({ where: { status: 'AVAILABLE' } }),
      prisma.vehicle.count(),
      prisma.vehicle.count({ where: { status: 'MAINTENANCE' } }),
      prisma.trip.count({ where: { scheduledAt: { gte: startOfDay, lt: endOfDay } } }),
      prisma.trip.count({
        where: {
          status: { in: ['EN_ROUTE', 'ARRIVED', 'PICKED_UP'] },
        },
      }),
      prisma.trip.count({
        where: { status: 'COMPLETED', updatedAt: { gte: startOfDay, lt: endOfDay } },
      }),
      prisma.maintenance.count({
        where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      }),
    ]);

    res.json({
      drivers: { total: driversTotal, available: driversAvailable },
      vehicles: { total: vehiclesTotal, inMaintenance: vehiclesInMaintenance },
      trips: { today: tripsToday, active: tripsActive, completedToday: tripsCompletedToday },
      maintenance: { open: openMaintenance },
    });
  }),
);
