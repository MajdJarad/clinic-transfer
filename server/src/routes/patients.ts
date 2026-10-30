import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';

export const patientsRouter = Router();

patientsRouter.use(authenticate, requireRole('ADMIN', 'COORDINATOR'));

patientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const patients = await prisma.patient.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
              { nationalId: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(patients);
  }),
);

const patientSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  nationalId: z.string().optional(),
  notes: z.string().optional(),
});

patientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = patientSchema.parse(req.body);
    const patient = await prisma.patient.create({ data });
    res.status(201).json(patient);
  }),
);

patientsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = patientSchema.partial().parse(req.body);
    const patient = await prisma.patient.update({ where: { id: req.params.id }, data });
    res.json(patient);
  }),
);

patientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: { trips: { orderBy: { scheduledAt: 'desc' }, take: 20 } },
    });
    if (!patient) throw new HttpError(404, 'Patient not found');
    res.json(patient);
  }),
);
