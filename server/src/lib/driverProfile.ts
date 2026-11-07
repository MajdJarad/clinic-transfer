import { prisma } from '../db';

/**
 * A DRIVER account only works when it is linked to a Driver row: trips, positions, alerts and the vehicle all
 * hang on that row. An account that became a driver without one (role changed afterwards, or a profile lost)
 * would log in fine and then show nothing, so the row is created whenever it is missing.
 */
export async function ensureDriverProfile(userId: string): Promise<string> {
  const existing = await prisma.driver.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return existing.id;
  try {
    return (await prisma.driver.create({ data: { userId }, select: { id: true } })).id;
  } catch (err) {
    // Two requests at once: the other one created it first.
    const again = await prisma.driver.findUnique({ where: { userId }, select: { id: true } });
    if (again) return again.id;
    throw err;
  }
}
