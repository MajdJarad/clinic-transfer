import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../constants';
import { prisma } from '../db';
import { verifyToken } from '../lib/auth';
import { ensureDriverProfile } from '../lib/driverProfile';
import { HttpError } from '../lib/http';

/**
 * Who is calling: the token proves who logged in, but the DATABASE says what that account is now.
 * A token can outlive its account (the database was reset or the user was removed) or carry a driver link
 * that no longer matches. Trusting the token alone leaves a phone that looks logged in while nothing works:
 * no trips, positions that go nowhere. So the account is looked up on every request; if it is gone or
 * disabled the session is refused (401) and the app returns to the login screen, and the role/driver link
 * always comes from the database.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Authentication required'));
  }
  let claims;
  try {
    claims = verifyToken(header.slice(7));
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, active: true, driver: { select: { id: true } } },
    });
    if (!user || !user.active) return next(new HttpError(401, 'الجلسة لم تعد صالحة، يرجى تسجيل الدخول من جديد'));
    // A driver account without its Driver row would show nothing: repair the link on the spot.
    const driverId = user.driver?.id ?? (user.role === 'DRIVER' ? await ensureDriverProfile(user.id) : null);
    req.user = { ...claims, sub: user.id, role: user.role as Role, driverId };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }
    return next();
  };
}
