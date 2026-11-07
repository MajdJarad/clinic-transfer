import path from 'node:path';

/**
 * Is the database somewhere that survives a deploy / restart?
 *
 * A relative SQLite file ("file:./dev.db") lives inside the app image/container. On a free Render web
 * service the container is rebuilt from the image on every deploy and again after the service goes to
 * sleep (15 min without traffic), so everything created in the app (accounts, trips, assignments, positions,
 * settings) silently goes back to the bundled demo data. It is persistent only when it is an absolute path on
 * a mounted disk, or a server database (postgres/mysql). DATA_PERSISTENT=true|false overrides the guess.
 */
export function databaseIsPersistent(databaseUrl: string | undefined, override?: string): boolean {
  if (override === 'true') return true;
  if (override === 'false') return false;
  const url = databaseUrl ?? '';
  if (/^(postgres|postgresql|mysql|mongodb)/i.test(url)) return true;
  if (url.startsWith('file:')) return path.isAbsolute(url.slice(5));
  return false;
}
