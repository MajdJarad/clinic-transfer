import path from 'path';
import fs from 'fs';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env, googleMapsEnabled, traccarEnabled } from './env';
import { errorHandler, notFoundHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { driversRouter } from './routes/drivers';
import { vehiclesRouter } from './routes/vehicles';
import { patientsRouter } from './routes/patients';
import { tripsRouter } from './routes/trips';
import { maintenanceRouter } from './routes/maintenance';
import { dashboardRouter } from './routes/dashboard';
import { geoRouter } from './routes/geo';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'transfer-server' }));

// Public runtime config for the web client.
// Maps are rendered with Google Maps (GOOGLE_MAPS_API_KEY). Routing and place
// search also go through Google when the key is set (see routes/geo.ts).
app.get('/api/config', (_req, res) => {
  res.json({
    mapProvider: 'google',
    googleMapsApiKey: env.googleMapsApiKey,
    traccarEnabled,
    defaultCenter: { lat: env.mapCenterLat, lng: env.mapCenterLng },
    defaultZoom: env.mapCenterZoom,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/geo', geoRouter);

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
if (webDist) {
  console.log(`Serving web app from ${webDist}`);
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  console.log('web/dist not found, running API only');
}

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Transfer server listening on http://localhost:${env.port}`);
});
