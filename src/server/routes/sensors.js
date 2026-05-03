/**
 * Sensor data routes.
 * Provides soil moisture (BeagleBone ADC) and weather data (Open-Meteo API).
 */

import express from 'express';
import { readAnalog } from '../gpio.js';

const router = express.Router();

/**
 * Fetch recent precipitation from the Open-Meteo free API.
 * Returns null if weather config is incomplete or the request fails.
 * @param {object} config
 * @returns {Promise<{recentRainMm: number, description: string}|null>}
 */
export async function getWeatherData(config) {
  const { lat, lon } = config.weather ?? {};
  if (!lat || !lon) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum&timezone=auto&past_days=1&forecast_days=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const data = await res.json();

  const precipitation = data.daily?.precipitation_sum ?? [];
  // yesterday's total (index 0) is the "recent rain" figure
  const recentRainMm = precipitation[0] ?? 0;
  const todayRainMm = precipitation[1] ?? 0;

  return {
    recentRainMm,
    todayRainMm,
    description: recentRainMm > 0 ? `${recentRainMm} mm yesterday` : 'No recent rain',
  };
}

/**
 * Read the soil moisture sensor via the BeagleBone ADC.
 * Returns a percentage 0–100 (0 = dry, 100 = saturated).
 * @param {object} config
 * @returns {Promise<number>}
 */
export async function getSoilMoisture(config) {
  const pin = config.sensor?.soilMoisturePin ?? 'P9_33';
  const raw = await readAnalog(pin);
  // Capacitive sensors output high voltage when dry; invert so 100% = wet
  return Math.round((1 - raw) * 100);
}

// ─── Route handlers ──────────────────────────────────────────────────────────

/**
 * GET /api/sensors
 * Returns combined soil moisture and weather data.
 */
router.get('/', async (req, res) => {
  const config = req.app.locals.config;
  try {
    const [moisture, weather] = await Promise.allSettled([
      getSoilMoisture(config),
      getWeatherData(config),
    ]);

    res.json({
      soilMoisture: moisture.status === 'fulfilled' ? moisture.value : null,
      weather: weather.status === 'fulfilled' ? weather.value : null,
      errors: {
        soilMoisture: moisture.status === 'rejected' ? moisture.reason.message : null,
        weather: weather.status === 'rejected' ? weather.reason.message : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
