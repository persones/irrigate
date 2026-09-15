import mqtt from 'mqtt';

const env = {
  mqttUrl: process.env.MQTT_URL || 'mqtt://192.168.86.75:1883',
  mqttUsername: process.env.MQTT_USERNAME || undefined,
  mqttPassword: process.env.MQTT_PASSWORD || undefined,
  deviceId: process.env.IRRIGATE_DEVICE_ID || 'irrigate-feather-1',
  telemetryIntervalMs: Number(process.env.SIM_TELEMETRY_INTERVAL_MS || 30000),
  stateIntervalMs: Number(process.env.SIM_STATE_INTERVAL_MS || 30000),
  zoneAutoOffMs: Number(process.env.SIM_ZONE_AUTO_OFF_MS || 0),
  soilMin: Number(process.env.SIM_SOIL_MIN || 20),
  soilMax: Number(process.env.SIM_SOIL_MAX || 70),
  verbose: (process.env.SIM_VERBOSE || '1') !== '0',
};

function topicBase() {
  return `irrigate/${env.deviceId}`;
}

function topic(suffix) {
  return `${topicBase()}${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function log(message) {
  if (!env.verbose) return;
  console.log(`[${nowIso()}] ${message}`);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseZoneCommandTopic(value) {
  const prefix = topic('/zone/');
  const suffix = '/set';
  if (!value.startsWith(prefix) || !value.endsWith(suffix)) {
    return null;
  }
  return value.slice(prefix.length, value.length - suffix.length);
}

const state = {
  online: false,
  timeSynced: true,
  relayByte: 0,
  zones: new Map(),
  config: {
    version: 1,
    deviceId: env.deviceId,
    timezone: 'UTC0',
    relay: {
      i2cAddress: 39,
      channels: 8,
    },
    zones: [],
  },
};

const zoneTimers = new Map();

function clearZoneTimer(zoneId) {
  const existing = zoneTimers.get(zoneId);
  if (existing) {
    clearTimeout(existing);
    zoneTimers.delete(zoneId);
  }
}

function setRelayBit(channel, isOn) {
  const chan = Number(channel);
  if (!Number.isInteger(chan) || chan < 1 || chan > 8) {
    return;
  }
  const mask = 1 << (chan - 1);
  state.relayByte = isOn ? (state.relayByte | mask) : (state.relayByte & ~mask);
}

function publish(client, targetTopic, payload, options = {}) {
  client.publish(targetTopic, payload, options, (err) => {
    if (err) {
      console.warn(`publish failed for ${targetTopic}: ${err.message}`);
      return;
    }
    log(`PUB ${targetTopic} -> ${payload}`);
  });
}

function publishControllerState(client) {
  const payload = JSON.stringify({
    online: state.online,
    timeSynced: state.timeSynced,
    relayByte: state.relayByte,
  });
  publish(client, topic('/state'), payload, { retain: true, qos: 1 });
}

function publishSoilTelemetry(client) {
  const min = Math.min(env.soilMin, env.soilMax);
  const max = Math.max(env.soilMin, env.soilMax);
  const moisture = clamp(randomInt(min, max), 0, 100);
  publish(client, topic('/telemetry/soilMoisture'), String(moisture), { retain: true, qos: 1 });
}

function publishZoneState(client, zoneId, isOn) {
  publish(client, topic(`/zone/${zoneId}/state`), isOn ? 'ON' : 'OFF', { retain: true, qos: 1 });
}

function applyZoneCommand(client, zoneId, requestedOn) {
  const zone = state.zones.get(zoneId);
  if (!zone) {
    log(`Ignored zone command for unknown zone ${zoneId}`);
    return;
  }

  clearZoneTimer(zoneId);
  zone.active = requestedOn;
  setRelayBit(zone.channel, requestedOn);
  publishZoneState(client, zoneId, requestedOn);
  publishControllerState(client);

  if (requestedOn && env.zoneAutoOffMs > 0) {
    const timer = setTimeout(() => {
      const liveZone = state.zones.get(zoneId);
      if (!liveZone || !liveZone.active) {
        return;
      }
      liveZone.active = false;
      setRelayBit(liveZone.channel, false);
      publishZoneState(client, zoneId, false);
      publishControllerState(client);
      zoneTimers.delete(zoneId);
      log(`Auto-off applied for zone ${zoneId}`);
    }, env.zoneAutoOffMs);
    zoneTimers.set(zoneId, timer);
  }
}

function applyConfig(client, payloadText) {
  let parsed;
  try {
    parsed = JSON.parse(payloadText);
  } catch (err) {
    console.warn(`Invalid config payload: ${err.message}`);
    return;
  }

  const nextDeviceId = String(parsed.deviceId || env.deviceId);
  if (nextDeviceId !== env.deviceId) {
    log(
      `Received config for deviceId=${nextDeviceId}; simulator keeps IRRIGATE_DEVICE_ID=${env.deviceId}.`,
    );
  }

  state.config = {
    version: Number(parsed.version || 1),
    deviceId: env.deviceId,
    timezone: String(parsed.timezone || 'UTC0'),
    relay: {
      i2cAddress: Number(parsed.relay?.i2cAddress || 39),
      channels: Number(parsed.relay?.channels || 8),
    },
    zones: Array.isArray(parsed.zones) ? parsed.zones : [],
  };

  state.zones.clear();
  state.relayByte = 0;

  for (const zone of state.config.zones) {
    const id = String(zone.id);
    const channel = Number(zone.channel);
    const enabled = Boolean(zone.enabled);
    const active = Boolean(zone.active);

    state.zones.set(id, {
      id,
      channel,
      enabled,
      active,
    });

    if (active) {
      setRelayBit(channel, true);
    }
  }

  log(`Applied config with ${state.zones.size} zone(s)`);

  for (const [zoneId, zone] of state.zones.entries()) {
    publishZoneState(client, zoneId, Boolean(zone.active));
  }
  publishControllerState(client);
}

function setupGracefulShutdown(client) {
  const shutdown = (signal) => {
    log(`Received ${signal}, publishing offline availability`);
    state.online = false;
    publish(client, topic('/availability'), 'offline', { retain: true, qos: 1 });

    setTimeout(() => {
      client.end(false, () => process.exit(0));
    }, 250);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function start() {
  const clientId = `${env.deviceId}-sim-${Math.random().toString(16).slice(2, 8)}`;

  const client = mqtt.connect(env.mqttUrl, {
    username: env.mqttUsername,
    password: env.mqttPassword,
    reconnectPeriod: 3000,
    will: {
      topic: topic('/availability'),
      payload: 'offline',
      qos: 1,
      retain: true,
    },
    clientId,
  });

  client.on('connect', () => {
    log(`Connected to ${env.mqttUrl} as ${clientId}`);
    state.online = true;

    client.subscribe(topic('/config/set'), { qos: 1 });
    client.subscribe(topic('/zone/+/set'), { qos: 1 });

    publish(client, topic('/availability'), 'online', { retain: true, qos: 1 });
    publishControllerState(client);

    for (const [zoneId, zone] of state.zones.entries()) {
      publishZoneState(client, zoneId, Boolean(zone.active));
    }
  });

  client.on('reconnect', () => {
    log('Reconnecting to MQTT broker...');
  });

  client.on('close', () => {
    state.online = false;
    log('MQTT connection closed');
  });

  client.on('error', (err) => {
    console.warn(`MQTT error: ${err.message}`);
  });

  client.on('message', (incomingTopic, payloadBuf) => {
    const payload = payloadBuf.toString('utf8');
    log(`SUB ${incomingTopic} -> ${payload}`);

    if (incomingTopic === topic('/config/set')) {
      applyConfig(client, payload);
      return;
    }

    const zoneId = parseZoneCommandTopic(incomingTopic);
    if (!zoneId) {
      return;
    }

    const normalized = payload.trim().toLowerCase();
    const turnOn = normalized === 'on' || normalized === '1' || normalized === 'true';
    applyZoneCommand(client, zoneId, turnOn);
  });

  setInterval(() => {
    if (client.connected) {
      publishSoilTelemetry(client);
    }
  }, Math.max(1000, env.telemetryIntervalMs));

  setInterval(() => {
    if (client.connected) {
      publishControllerState(client);
    }
  }, Math.max(1000, env.stateIntervalMs));

  setupGracefulShutdown(client);

  log('Controller simulator started');
  log(`Topics base: ${topicBase()}`);
  log('Waiting for /config/set and /zone/<id>/set commands');
}

start();
