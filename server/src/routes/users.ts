import { Router } from 'express';
import { z } from 'zod';
import { roleSchema } from '../constants';
import { prisma } from '../db';
import { hashPassword } from '../lib/auth';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate, requireRole } from '../middleware/auth';

export const usersRouter = Router();

usersRouter.use(authenticate, requireRole('ADMIN'));

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        driver: { select: { id: true, status: true } },
      },
    });
    res.json(users);
  }),
);

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: roleSchema,
  createDriverProfile: z.boolean().optional(),
});

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new HttpError(409, 'Email already in use');

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        passwordHash: await hashPassword(data.password),
        driver:
          data.role === 'DRIVER'
            ? { create: {} }
            : undefined,
      },
      select: { id: true, name: true, email: true, role: true, driver: true },
    });
    res.status(201).json(user);
  }),
);

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().nullable().optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new HttpError(404, 'User not found');

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: data.name,
        phone: data.phone,
        role: data.role,
        active: data.active,
        passwordHash: data.password ? await hashPassword(data.password) : undefined,
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    res.json(updated);
  }),
);
