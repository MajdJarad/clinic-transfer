import { Router } from 'express';
import { z } from 'zod';
import type { Role } from '../constants';
import { prisma } from '../db';
import { signToken, verifyPassword } from '../lib/auth';
import { asyncHandler, HttpError } from '../lib/http';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { driver: true },
    });
    if (!user || !user.active) throw new HttpError(401, 'Invalid credentials');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials');

    const token = signToken({
      sub: user.id,
      role: user.role as Role,
      driverId: user.driver?.id ?? null,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        driverId: user.driver?.id ?? null,
      },
    });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { driver: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      driverId: user.driver?.id ?? null,
    });
  }),
);
