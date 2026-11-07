import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http';

/**
 * Per-user request limiter (fixed window, in memory). Protects the Google quota/billing from a
 * runaway client or a leaked login, since every geo request is a paid call.
 */
export function rateLimit(opts: { windowMs: number; max: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, { count: number; resetAt: number }>();

  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }, opts.windowMs);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.sub ?? req.ip ?? 'anonymous';
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      return next(new HttpError(429, 'Too many requests, please slow down'));
    }
    return next();
  };
}
