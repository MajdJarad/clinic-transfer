import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from './rateLimit';
import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  it('returns a value until it expires', () => {
    let t = 1000;
    const c = new TtlCache<string>(100, 10, () => t);
    c.set('a', 'x');
    expect(c.get('a')).toBe('x');
    t += 99;
    expect(c.get('a')).toBe('x');
    t += 2;
    expect(c.get('a')).toBeUndefined();
  });
  it('drops the oldest entries past the size cap', () => {
    const c = new TtlCache<number>(1000, 2, () => 0);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });
  it('caches null (a lookup that found nothing)', () => {
    const c = new TtlCache<string | null>(1000, 5, () => 0);
    c.set('k', null);
    expect(c.get('k')).toBeNull();
  });
});

describe('rateLimit', () => {
  const run = (mw: ReturnType<typeof rateLimit>, user: string) => {
    let err: unknown;
    const res = { setHeader() {} } as unknown as Response;
    mw({ user: { sub: user } } as unknown as Request, res, ((e?: unknown) => (err = e)) as NextFunction);
    return err as { status?: number } | undefined;
  };
  it('allows up to max per window, then answers 429, per user', () => {
    let t = 0;
    const mw = rateLimit({ windowMs: 1000, max: 2, now: () => t });
    expect(run(mw, 'u1')).toBeUndefined();
    expect(run(mw, 'u1')).toBeUndefined();
    expect(run(mw, 'u1')?.status).toBe(429);
    expect(run(mw, 'u2')).toBeUndefined(); // another user is unaffected
    t += 1001; // new window
    expect(run(mw, 'u1')).toBeUndefined();
  });
});
