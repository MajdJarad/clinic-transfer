import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../constants';
import { verifyToken } from '../lib/auth';
import { HttpError } from '../lib/http';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Authentication required'));
  }
  try {
    req.user = verifyToken(header.slice(7));
    return next();
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
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
