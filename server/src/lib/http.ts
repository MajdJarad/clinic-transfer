import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

// Map known error types to a client-facing status + message. Anything not
// recognised is a real server fault: log it and hide the details from clients
// (raw Prisma errors include server source code and schema information).
function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof ZodError) {
    const message = err.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    return new HttpError(400, message || 'Invalid request');
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2025': // Record to update/delete not found
        return new HttpError(404, 'Not found');
      case 'P2002': {
        // Unique constraint violation
        const target = (err.meta?.target as string[] | string | undefined) ?? [];
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return new HttpError(409, fields ? `Already exists: ${fields}` : 'Already exists');
      }
      case 'P2003': // Foreign key constraint failed
        return new HttpError(409, 'Related record missing or still in use');
    }
  }

  // express.json() body parse failures
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    return new HttpError(400, 'Malformed JSON body');
  }

  return new HttpError(500, 'Internal server error');
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const httpError = toHttpError(err);
  if (httpError.status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(httpError.status).json({ error: httpError.message });
}
