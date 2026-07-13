/**
 * Zone API routes.
 *
 * GET    /api/zones            – list all zones
 * POST   /api/zones            – create a zone
 * GET    /api/zones/:id        – get a single zone
 * PUT    /api/zones/:id        – update a zone
 * DELETE /api/zones/:id        – remove a zone
 * GET    /api/zones/:id/schedule  – get zone schedule
 * PUT    /api/zones/:id/schedule  – update zone schedule
 * POST   /api/zones/:id/on    – turn zone on manually
 * POST   /api/zones/:id/off   – turn zone off manually
 */

import express from 'express';
import { randomUUID } from 'crypto';
import {
  publishConfigToController,
  publishZoneCommand,
  getCachedZoneState,
} from '../mqtt-service.js';

const router = express.Router();

const VALID_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function validateChannel(channel) {
  return Number.isInteger(channel) && channel >= 1 && channel <= 8;
}

function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return 'schedule must be an object';
  if (!Array.isArray(schedule.days) || schedule.days.some((d) => !VALID_DAYS.includes(d))) {
    return 'schedule.days must be an array of day abbreviations (sun–sat)';
  }
  if (!/^\d{2}:\d{2}$/.test(schedule.startTime)) {
    return 'schedule.startTime must be HH:MM';
  }
  if (typeof schedule.duration !== 'number' || schedule.duration < 1) {
    return 'schedule.duration must be a positive number (minutes)';
  }
  return null;
}

// ─── List all zones ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const zones = req.app.locals.config.zones.map((zone) => {
    const active = getCachedZoneState(zone.id);
    return {
      ...zone,
      active: active === undefined ? Boolean(zone.active) : active,
    };
  });
  res.json(zones);
});

// ─── Create zone ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, channel, enabled = true, schedule } = req.body;
  if (!name || channel === undefined) {
    return res.status(400).json({ error: 'name and channel are required' });
  }
  if (!validateChannel(channel)) {
    return res.status(400).json({ error: 'channel must be an integer 1-8' });
  }
  const schedErr = validateSchedule(schedule);
  if (schedErr) return res.status(400).json({ error: schedErr });

  const zone = {
    id: randomUUID(),
    name,
    channel,
    enabled,
    active: false,
    schedule,
  };

  req.app.locals.config.zones.push(zone);
  req.app.locals.saveConfig();
  publishConfigToController(req.app.locals.config);
  res.status(201).json(zone);
});

// ─── Get single zone ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const zone = req.app.locals.config.zones.find((z) => z.id === req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });
  res.json(zone);
});

// ─── Update zone ──────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const zone = req.app.locals.config.zones.find((z) => z.id === req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  const { name, channel, enabled } = req.body;
  if (name !== undefined) zone.name = name;
  if (channel !== undefined) {
    if (!validateChannel(channel)) {
      return res.status(400).json({ error: 'channel must be an integer 1-8' });
    }
    zone.channel = channel;
  }
  if (enabled !== undefined) zone.enabled = enabled;

  req.app.locals.saveConfig();
  publishConfigToController(req.app.locals.config);
  res.json(zone);
});

// ─── Delete zone ──────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const { config } = req.app.locals;
  const idx = config.zones.findIndex((z) => z.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Zone not found' });

  const [zone] = config.zones.splice(idx, 1);
  req.app.locals.saveConfig();
  publishConfigToController(req.app.locals.config);
  res.json({ deleted: zone.id });
});

// ─── Get schedule ─────────────────────────────────────────────────────────────
router.get('/:id/schedule', (req, res) => {
  const zone = req.app.locals.config.zones.find((z) => z.id === req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });
  res.json(zone.schedule);
});

// ─── Update schedule ──────────────────────────────────────────────────────────
router.put('/:id/schedule', (req, res) => {
  const zone = req.app.locals.config.zones.find((z) => z.id === req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  const schedErr = validateSchedule(req.body);
  if (schedErr) return res.status(400).json({ error: schedErr });

  zone.schedule = req.body;
  req.app.locals.saveConfig();
  publishConfigToController(req.app.locals.config);
  res.json(zone.schedule);
});

// ─── Manual ON ────────────────────────────────────────────────────────────────
router.post('/:id/on', (req, res) => {
  const zone = req.app.locals.config.zones.find((z) => z.id === req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  publishZoneCommand(zone.id, true);
  zone.active = true;
  res.json({ id: zone.id, active: zone.active });
});

// ─── Manual OFF ───────────────────────────────────────────────────────────────
router.post('/:id/off', (req, res) => {
  const zone = req.app.locals.config.zones.find((z) => z.id === req.params.id);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  publishZoneCommand(zone.id, false);
  zone.active = false;
  res.json({ id: zone.id, active: zone.active });
});

export default router;
