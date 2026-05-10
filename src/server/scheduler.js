/**
 * Zone schedule runner.
 * Checks each zone's schedule every minute and activates zones as needed.
 * Skips watering if recent rainfall or soil moisture is above threshold.
 */

import { channelOn, channelOff } from './relay-adapter.js';
import { getWeatherData, getSoilMoisture } from './routes/sensors.js';

// Active timers keyed by zone id
const activeTimers = {};

/**
 * Returns true if today is in the zone's scheduled days.
 * @param {string[]} days  e.g. ['mon','wed','fri']
 * @returns {boolean}
 */
function isScheduledToday(days) {
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = dayNames[new Date().getDay()];
  return days.includes(today);
}

/**
 * Returns true if the current HH:MM matches the zone's start time.
 * @param {string} startTime  e.g. '06:00'
 * @returns {boolean}
 */
function isStartTime(startTime) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}` === startTime;
}

/**
 * Determine if watering should be skipped based on recent rain or soil moisture.
 * @param {object} config  The full application config
 * @returns {Promise<boolean>}
 */
async function shouldSkip(config) {
  try {
    const weather = await getWeatherData(config);
    if (weather && weather.recentRainMm >= config.weather.rainThresholdMm) {
      console.log(`Scheduler: skipping – recent rain ${weather.recentRainMm} mm`);
      return true;
    }
  } catch (err) {
    console.warn('Scheduler: could not check weather data:', err.message);
  }

  try {
    const moisture = await getSoilMoisture(config);
    if (moisture !== null && moisture >= config.sensor.dryThreshold) {
      console.log(`Scheduler: skipping – soil moisture ${moisture}% (above threshold)`);
      return true;
    }
  } catch (err) {
    console.warn('Scheduler: could not check soil moisture:', err.message);
  }

  return false;
}

/**
 * Turn a zone on for the specified duration, then turn it off.
 * @param {object} zone
 */
export function activateZone(zone) {
  if (activeTimers[zone.id]) {
    console.log(`Scheduler: zone ${zone.id} already active`);
    return;
  }
  const channel = zone.channel;
  console.log(`Scheduler: activating zone ${zone.id} (${zone.name}) for ${zone.schedule.duration} min`);
  channelOn(channel);
  zone.active = true;

  activeTimers[zone.id] = setTimeout(() => {
    channelOff(channel);
    zone.active = false;
    delete activeTimers[zone.id];
    console.log(`Scheduler: zone ${zone.id} (${zone.name}) watering complete`);
  }, zone.schedule.duration * 60 * 1000);
}

/**
 * Immediately stop a zone.
 * @param {object} zone
 */
export function deactivateZone(zone) {
  const channel = zone.channel;
  if (activeTimers[zone.id]) {
    clearTimeout(activeTimers[zone.id]);
    delete activeTimers[zone.id];
  }
  channelOff(channel);
  zone.active = false;
  console.log(`Scheduler: zone ${zone.id} (${zone.name}) turned off`);
}

/**
 * Start the schedule ticker. Checks every 60 seconds.
 * @param {object} config  Mutable config object shared with routes
 * @returns {NodeJS.Timeout}  The interval handle (can be cleared to stop the scheduler)
 */
export function startScheduler(config) {
  console.log('Scheduler: started');
  return setInterval(async () => {
    for (const zone of config.zones) {
      if (!zone.enabled) continue;
      if (!isScheduledToday(zone.schedule.days)) continue;
      if (!isStartTime(zone.schedule.startTime)) continue;

      const skip = await shouldSkip(config);
      if (!skip) {
        activateZone(zone);
      }
    }
  }, 60 * 1000);
}
