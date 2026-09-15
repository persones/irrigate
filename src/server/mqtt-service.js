import mqtt from 'mqtt';

let client = null;
let started = false;
let currentDeviceId = 'irrigate-feather-1';
let mqttEnabled = false;

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

function withOptionalLeadingSlash(topic) {
  return topic.startsWith('/') ? topic : `/${topic}`;
}

function topicVariants(topic) {
  const variants = new Set([topic, withOptionalLeadingSlash(topic)]);
  return [...variants];
}

function parseZoneIdFromStateTopic(topic) {
  const suffix = '/state';
  for (const prefix of [withBase('/zone/'), withOptionalLeadingSlash(withBase('/zone/'))]) {
    if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) {
      continue;
    }
    return topic.slice(prefix.length, topic.length - suffix.length);
  }
  return null;
}

function onMessage(topic, payload) {
  const text = payload.toString('utf8');
  state.lastMessageAt = Date.now();

  if (topicVariants(withBase('/availability')).includes(topic)) {
    state.availability = text;
    return;
  }

  if (topicVariants(withBase('/state')).includes(topic)) {
    try {
      state.controller = JSON.parse(text);
    } catch {
      state.controller = null;
    }
    return;
  }

  if (topicVariants(withBase('/telemetry/soilMoisture')).includes(topic)) {
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
  const host = process.env.MQTT_URL || 'mqtt://localhost:1883';
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
  for (const topic of [
    withBase('/availability'),
    withOptionalLeadingSlash(withBase('/availability')),
    withBase('/state'),
    withOptionalLeadingSlash(withBase('/state')),
    withBase('/telemetry/soilMoisture'),
    withOptionalLeadingSlash(withBase('/telemetry/soilMoisture')),
    withBase('/zone/+/state'),
    withOptionalLeadingSlash(withBase('/zone/+/state')),
  ]) {
    client.subscribe(topic);
  }
}

function normalizeConfigForController(config) {
  return {P
    /*version: 1,
    timezone: process.env.IRRIGATE_TIMEZONE || 'UTC0',
    relay: {
      i2cAddress: Number(process.env.IRRIGATE_RELAY_I2C_ADDRESS || 39),
      channels: Number(process.env.IRRIGATE_RELAY_CHANNELS || 8),
      },*/
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
  }
}

export function startMqttService(config) {
  if (started) return;
  started = true;

  currentDeviceId = process.env.IRRIGATE_DEVICE_ID || 'irrigate-feather-1';
  const clientConfig = mqttClientConfig();

  if (!clientConfig) {
    mqttEnabled = false;
    console.warn('MQTT: disabled (set MQTT_URL to connect to a broker)');
    return;
  }

  const { host, options } = clientConfig;

  mqttEnabled = true;

  client = mqtt.connect(host, options);

  client.on('connect', () => {
    console.log(`MQTT: connected to ${host}`);
    subscribeCoreTopics();
    client.publish(withBase('/server/availability'), 'online', { retain: true, qos: 1 });
    publishConfigToController(config);
  });

  client.on('reconnect', () => {
    console.log(`MQTT: reconnecting to ${host}`);
    client.publish(withBase('/server/availability'), 'online', { retain: true, qos: 1 });
    publishConfigToController(config);
  });

  client.on('message', onMessage);

  client.on('error', (err) => {
    console.warn('MQTT: client error:', err.message);
  });
}

export function publishConfigToController(config) {
  if (!mqttEnabled || !client || !client.connected) {
    return false;
  }

  const payload = JSON.stringify(normalizeConfigForController(config));
  const configTopic = withBase('/config/set');
  client.publish(configTopic, payload, { retain: true, qos: 1 });
  client.publish(withOptionalLeadingSlash(configTopic), payload, { retain: true, qos: 1 });
  console.log('topic: ' + configTopic + ' payload: ' + payload);
  console.log('topic length: ' + configTopic.length + ' payload length: ' + payload.length);
  return true;
}

export function publishZoneCommand(zoneId, on) {
  if (!mqttEnabled || !client || !client.connected) {
    return false;
  }

  const zoneTopic = withBase(`/zone/${zoneId}/set`);
  client.publish(zoneTopic, on ? 'ON' : 'OFF', { retain: false, qos: 1 });
  client.publish(withOptionalLeadingSlash(zoneTopic), on ? 'ON' : 'OFF', { retain: false, qos: 1 });
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
    enabled: mqttEnabled,
    availability: state.availability,
    controller: state.controller,
    soilMoisture: state.soilMoisture,
    lastMessageAt: state.lastMessageAt,
  };
}
