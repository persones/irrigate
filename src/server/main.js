import express from 'express';
import ViteExpress from 'vite-express';
import path from 'path';
import cors from 'cors';
import http from 'http';
import fs from 'fs';

import { fileURLToPath } from 'url';
import { setupChannel } from './gpio.js';
import { startScheduler } from './scheduler.js';
import zonesRouter from './routes/zones.js';
import sensorsRouter from './routes/sensors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const publicFolder = path.join(__dirname, '..', '..', 'public');
console.log(`public folder: ${publicFolder}`);
app.use(express.static(publicFolder));

// ─── Config ──────────────────────────────────────────────────────────────────

const configPath = path.join(publicFolder, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/** Persist the in-memory config back to disk. */
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// Make config and saveConfig available to route handlers via app.locals
app.locals.config = config;
app.locals.saveConfig = saveConfig;

// ─── GPIO initialisation ─────────────────────────────────────────────────────

for (const zone of config.zones) {
  setupChannel(zone.channel);
  zone.active = false;
}

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api/zones', zonesRouter);
app.use('/api/sensors', sensorsRouter);

/** GET /api/status – lightweight health check */
app.get('/api/status', (_req, res) => {
  res.json({ ok: true, zonesCount: config.zones.length });
});

// ─── HTTP server ──────────────────────────────────────────────────────────────

const httpServer = http.createServer(app);

httpServer.listen(3000, () => {
  console.log('Server is listening on port 3000');
  startScheduler(config);
});

ViteExpress.bind(app, httpServer);

