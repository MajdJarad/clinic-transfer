import { describe, expect, it } from 'vitest';
import { databaseIsPersistent } from './persistence';

describe('databaseIsPersistent', () => {
  it('a relative sqlite file inside the image is not persistent', () => {
    expect(databaseIsPersistent('file:./dev.db')).toBe(false);
    expect(databaseIsPersistent('file:dev.db')).toBe(false);
    expect(databaseIsPersistent(undefined)).toBe(false);
  });
  it('an absolute path (a mounted disk) is persistent', () => {
    expect(databaseIsPersistent('file:/data/clinic.db')).toBe(true);
  });
  it('a database server is persistent', () => {
    expect(databaseIsPersistent('postgresql://u:p@host/db')).toBe(true);
  });
  it('the override wins', () => {
    expect(databaseIsPersistent('file:/data/x.db', 'false')).toBe(false);
    expect(databaseIsPersistent('file:./dev.db', 'true')).toBe(true);
  });
});
