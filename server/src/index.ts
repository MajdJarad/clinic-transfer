import path from 'path';
import fs from 'fs';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env, googleMapsEnabled, traccarEnabled } from './env';
import { asyncHandler, errorHandler, notFoundHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { driversRouter } from './routes/drivers';
import { vehiclesRouter } from './routes/vehicles';
import { patientsRouter } from './routes/patients';
import { tripsRouter } from './routes/trips';
import { maintenanceRouter } from './routes/maintenance';
import { dashboardRouter } from './routes/dashboard';
import { geoRouter } from './routes/geo';
import { settingsRouter } from './routes/settings';
import { alertsRouter } from './routes/alerts';
import { getSettings } from './lib/settings';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Which web build is being served (the hashed main script), so an app left open can notice a newer one.
function webBuildId(): string | null {
  try {
    const html = fs.readFileSync(path.join(webDistDir() ?? '', 'index.html'), 'utf8');
    return /assets\/(index-[\w-]+)\.js/.exec(html)?.[1] ?? null;
  } catch {
    return null;
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'transfer-server', webBuild: webBuildId() }));

// Public runtime config for the web client.
// Maps, routing and place search all use Google Maps (GOOGLE_MAPS_API_KEY).
app.get(
  '/api/config',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
      mapProvider: 'google',
      googleMapsApiKey: env.googleMapsApiKey,
      googleMapId: env.googleMapId,
      traccarEnabled,
      clinicName: settings.clinicName,
      defaultCenter: { lat: settings.mapCenterLat, lng: settings.mapCenterLng },
      defaultZoom: settings.mapZoom,
    });
  }),
);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/geo', geoRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/alerts', alertsRouter);

// Optionally serve the built web app (production single-port deployment).
const candidateDistPaths = [
  process.env.WEB_DIST,
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(__dirname, '../web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'web/dist'),
  path.resolve(process.cwd(), 'dist'),
].filter(Boolean) as string[];

const webDist = candidateDistPaths.find((p) => fs.existsSync(p));
function webDistDir() {
  return webDist;
}
if (webDist) {
  console.log(`Serving web app from ${webDist}`);
  // The page itself is never cached (so a new deploy reaches everyone at once); the hashed files it
  // points to never change, so they are cached for good.
  app.use(
    express.static(webDist, {
      setHeaders(res, file) {
        res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  console.log('web/dist not found, running API only');
}

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Transfer server listening on http://localhost:${env.port}`);
});
