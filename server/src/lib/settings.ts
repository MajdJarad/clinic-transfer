import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';

// ───────────────────────── WhatsApp template ─────────────────────────

export const DEFAULT_WHATSAPP_TEMPLATE = `مرحباً {patientName}،

سيارة العيادة وصلت الآن إلى موقعك.
السيارة: {vehicleMake} {vehicleModel} ({vehicleColor})
رقم اللوحة: {vehiclePlate}
السائق: {driverName} - {driverPhone}

يرجى التوجه إلى السيارة. شكراً لك.`;

export const TEMPLATE_VARIABLES = [
  'patientName',
  'vehicleMake',
  'vehicleModel',
  'vehicleColor',
  'vehiclePlate',
  'driverName',
  'driverPhone',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/**
 * Fill `{variable}` placeholders (every occurrence). Optional values that are empty leave no
 * debris behind: "()" and a dangling " - " at the end of a line are removed.
 */
export function renderTemplate(template: string, vars: Partial<Record<TemplateVariable, string | null | undefined>>): string {
  const filled = template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    (TEMPLATE_VARIABLES as readonly string[]).includes(name) ? (vars[name as TemplateVariable] ?? '') : whole,
  );
  return filled
    .replace(/[ \t]*\(\s*\)/g, '')
    .replace(/[ \t]+-[ \t]*$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');
}

/** `{names}` in a template that are not a known variable (they would be sent to patients as-is). */
export function unknownVariables(template: string): string[] {
  const found = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((n) => !(TEMPLATE_VARIABLES as readonly string[]).includes(n)))];
}

// ───────────────────────── Settings ─────────────────────────

export const settingsSchema = z.object({
  clinicName: z.string().trim().min(1, 'اسم العيادة مطلوب').max(80),
  whatsappTemplate: z.string().trim().min(10, 'نص الرسالة قصير جداً').max(2000),
  mapCenterLat: z.number().min(-90).max(90),
  mapCenterLng: z.number().min(-180).max(180),
  mapZoom: z.number().int().min(1).max(20),
});
export type AppSettings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.partial().strict();

export function defaultSettings(): AppSettings {
  return {
    clinicName: 'عيادة النخبة الطبية',
    whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
    mapCenterLat: env.mapCenterLat,
    mapCenterLng: env.mapCenterLng,
    mapZoom: Math.round(env.mapCenterZoom) || 11,
  };
}

let cache: AppSettings | null = null;

/** Stored values over the defaults. Never throws: with no table/DB it serves the defaults. */
export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;
  const merged: Record<string, unknown> = { ...defaultSettings() };
  try {
    const rows = await prisma.setting.findMany();
    for (const row of rows) {
      const field = (settingsSchema.shape as Record<string, z.ZodTypeAny>)[row.key];
      if (!field) continue; // a key from a newer/older version: ignore
      try {
        const parsed = field.safeParse(JSON.parse(row.value));
        if (parsed.success) merged[row.key] = parsed.data;
      } catch {
        /* corrupt row: keep the default */
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[settings] could not read settings, using defaults:', (e as Error).message);
    return merged as AppSettings; // not cached, so it recovers once the table exists
  }
  cache = merged as AppSettings;
  return cache;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      }),
    ),
  );
  cache = null;
  return getSettings();
}

export async function resetSettings(): Promise<AppSettings> {
  await prisma.setting.deleteMany();
  cache = null;
  return getSettings();
}

/** For tests. */
export function clearSettingsCache() {
  cache = null;
}
