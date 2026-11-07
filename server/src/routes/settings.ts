import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { z } from 'zod';
import { env, googleMapsEnabled, traccarEnabled } from '../env';
import { asyncHandler } from '../lib/http';
import {
  defaultSettings,
  getSettings,
  renderTemplate,
  resetSettings,
  settingsPatchSchema,
  unknownVariables,
  updateSettings,
} from '../lib/settings';
import { authenticate, requireRole } from '../middleware/auth';

export const settingsRouter = Router();

settingsRouter.use(authenticate, requireRole('ADMIN'));

function appVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Read-only facts about the running server (what the old, fake "server settings" fields pretended to be). */
function systemInfo() {
  const url = process.env.DATABASE_URL ?? '';
  const file = url.startsWith('file:') ? url.slice(5) : '';
  const absolute = file !== '' && path.isAbsolute(file);
  return {
    version: appVersion(),
    environment: env.nodeEnv,
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      provider: 'sqlite',
      file: file ? path.basename(file) : 'unknown',
      // A relative SQLite file lives inside the app image/container: on most hosts it is lost on every
      // deploy or restart unless the path points at a persistent disk (an absolute path, e.g. /data/..).
      mayBeEphemeral: env.nodeEnv === 'production' && !absolute,
    },
    google: { mapsConfigured: googleMapsEnabled, mapIdConfigured: Boolean(env.googleMapId) },
    traccarEnabled,
  };
}

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings(), defaults: defaultSettings(), system: systemInfo() });
  }),
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const patch = settingsPatchSchema.parse(req.body);
    const settings = await updateSettings(patch);
    res.json({
      settings,
      // Placeholders that are not real variables would reach patients as literal text.
      warnings: patch.whatsappTemplate ? unknownVariables(patch.whatsappTemplate).map((v) => `{${v}} ليس متغيراً معروفاً`) : [],
    });
  }),
);

settingsRouter.post(
  '/reset',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await resetSettings() });
  }),
);

// Preview of a message template with sample data, rendered by the same code that builds real messages.
settingsRouter.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const { template } = z.object({ template: z.string().max(2000) }).parse(req.body);
    res.json({
      text: renderTemplate(template, {
        patientName: 'سارة العتيبي',
        vehicleMake: 'تويوتا',
        vehicleModel: 'كورولا',
        vehicleColor: 'أبيض',
        vehiclePlate: '34 MPV 786',
        driverName: 'محمد أحمد',
        driverPhone: '0500000000',
      }),
      unknown: unknownVariables(template),
    });
  }),
);
