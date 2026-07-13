import mqtt from 'mqtt';

let client = null;
let started = false;
let currentDeviceId = 'irrigate-feather-1';

const state = {
  availability: 'unknown',
  controller: null,
  soilMoisture: null,
  zoneStates: new Map(),
  lastMessageAt: null,
};

function topicBase() {
  return `irrigate/${currentDeviceId}`;
}

function withBase(suffix) {
  return `${topicBase()}${suffix}`;
}

function parseZoneIdFromStateTopic(topic) {
  const prefix = withBase('/zone/');
  const suffix = '/state';
  if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) {
    return null;
  }
  return topic.slice(prefix.length, topic.length - suffix.length);
}

function onMessage(topic, payload) {
  const text = payload.toString('utf8');
  state.lastMessageAt = Date.now();

  if (topic === withBase('/availability')) {
    state.availability = text;
    return;
  }

  if (topic === withBase('/state')) {
    try {
      state.controller = JSON.parse(text);
    } catch {
      state.controller = null;
    }
    return;
  }

  if (topic === withBase('/telemetry/soilMoisture')) {
    const value = Number(text);
    state.soilMoisture = Number.isFinite(value) ? value : null;
    return;
  }

  const zoneId = parseZoneIdFromStateTopic(topic);
  if (zoneId) {
    const normalized = text.toLowerCase();
    state.zoneStates.set(zoneId, normalized === 'on' || normalized === '1' || normalized === 'true');
  }
}

function mqttClientConfig() {
  const host = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;

  return {
    host,
    options: {
      username,
      password,
      reconnectPeriod: 3000,
      will: {
        topic: withBase('/server/availability'),
        payload: 'offline',
        retain: true,
        qos: 1,
      },
    },
  };
}

function subscribeCoreTopics() {
  if (!client) return;
  client.subscribe(withBase('/availability'));
  client.subscribe(withBase('/state'));
  client.subscribe(withBase('/telemetry/soilMoisture'));
  client.subscribe(withBase('/zone/+/state'));
}

function normalizeConfigForController(config) {
  return {
    version: 1,
    deviceId: currentDeviceId,
    timezone: process.env.IRRIGATE_TIMEZONE || 'UTC0',
    relay: {
      i2cAddress: Number(process.env.IRRIGATE_RELAY_I2C_ADDRESS || 39),
      channels: Number(process.env.IRRIGATE_RELAY_CHANNELS || 8),
    },
    zones: (config.zones || []).map((zone) => ({
      id: String(zone.id),
      name: zone.name,
      channel: zone.channel,
      enabled: Boolean(zone.enabled),
      schedule: {
        days: Array.isArray(zone.schedule?.days) ? zone.schedule.days : [],
        startTime: zone.schedule?.startTime || '06:00',
        durationMin: Number(zone.schedule?.duration || 10),
      },
    })),
  };
}

export function startMqttService(config) {
  if (started) return;
  started = true;

  currentDeviceId = process.env.IRRIGATE_DEVICE_ID || 'irrigate-feather-1';
  const { host, options } = mqttClientConfig();

  client = mqtt.connect(host, options);

  client.on('connect', () => {
    console.log(`MQTT: connected to ${host}`);
    subscribeCoreTopics();
    client.publish(withBase('/server/availability'), 'online', { retain: true, qos: 1 });
    publishConfigToController(config);
  });

  client.on('message', onMessage);

  client.on('error', (err) => {
    console.warn('MQTT: client error:', err.message);
  });
}

export function publishConfigToController(config) {
  if (!client || !client.connected) {
    return false;
  }

  const payload = JSON.stringify(normalizeConfigForController(config));
  client.publish(withBase('/config/set'), payload, { retain: true, qos: 1 });
  return true;
}

export function publishZoneCommand(zoneId, on) {
  if (!client || !client.connected) {
    return false;
  }

  client.publish(withBase(`/zone/${zoneId}/set`), on ? 'ON' : 'OFF', { retain: false, qos: 1 });
  return true;
}

export function getCachedSoilMoisture() {
  return state.soilMoisture;
}

export function getCachedZoneState(zoneId) {
  return state.zoneStates.get(String(zoneId));
}

export function getControllerAvailability() {
  return state.availability;
}

export function getMqttSnapshot() {
  return {
    availability: state.availability,
    controller: state.controller,
    soilMoisture: state.soilMoisture,
    lastMessageAt: state.lastMessageAt,
  };
}
