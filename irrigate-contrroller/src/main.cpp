#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <time.h>

#if defined(ESP8266)
#include <ESP8266WiFi.h>
#else
#include <WiFi.h>
#endif

#include "config_store.h"
#include "relay_driver.h"

namespace {
constexpr uint32_t kMqttReconnectIntervalMs = 5000;
constexpr uint32_t kNtpSyncIntervalMs = 60UL * 60UL * 1000UL;
constexpr uint32_t kSchedulerTickMs = 1000;
constexpr uint32_t kTelemetryIntervalMs = 30000;
constexpr uint32_t kAvailabilityRefreshMs = 15000;
constexpr uint16_t kMqttPacketBufferSize = 4096;

#if defined(ESP32)
// ADC2 pins cannot be read while Wi-Fi is active on ESP32.
constexpr uint8_t kSoilMoisturePin = 34;  // ADC1
#else
constexpr uint8_t kSoilMoisturePin = A1;
#endif

#ifndef WIFI_SSID
#define WIFI_SSID "Julyal"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "leftjack"
#endif

#ifndef MQTT_HOST
#define MQTT_HOST "192.168.86.75"
#endif

#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif

#ifndef MQTT_USERNAME
#define MQTT_USERNAME ""
#endif

#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD ""
#endif

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

DynamicJsonDocument configDoc(8192);
uint32_t lastMqttReconnectAttemptMs = 0;
uint32_t lastSchedulerTickMs = 0;
uint32_t lastTelemetryMs = 0;
uint32_t lastNtpSyncMs = 0;
uint32_t lastAvailabilityMs = 0;
int lastMinute = -1;

String deviceId() {
  const char* id = configDoc["deviceId"] | "irrigate-feather-1";
  return String(id);
}

String baseTopic() {
  return String("irrigate/") + deviceId();
}

String mqttClientId() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  mac.toLowerCase();
  return deviceId() + "-controller-" + mac;
}

String availabilityTopic() {
  return baseTopic() + "/availability";
}

String controllerStateTopic() {
  return baseTopic() + "/state";
}

String configSetTopic() {
  return baseTopic() + "/config/set";
}

String zoneCommandTopic(const String& zoneId) {
  return baseTopic() + "/zone/" + zoneId + "/set";
}

String zoneStateTopic(const String& zoneId) {
  return baseTopic() + "/zone/" + zoneId + "/state";
}

String soilTelemetryTopic() {
  return baseTopic() + "/telemetry/soilMoisture";
}

bool csvHasDay(const String& csvDays, const String& day) {
  int start = 0;
  while (start >= 0) {
    const int comma = csvDays.indexOf(',', start);
    const String token = (comma >= 0) ? csvDays.substring(start, comma) : csvDays.substring(start);
    String trimmed = token;
    trimmed.trim();
    trimmed.toLowerCase();
    if (trimmed == day) {
      return true;
    }
    if (comma < 0) {
      break;
    }
    start = comma + 1;
  }
  return false;
}

bool zoneScheduledToday(JsonVariantConst daysNode, const String& dayShort) {
  if (daysNode.is<JsonArrayConst>()) {
    for (JsonVariantConst item : daysNode.as<JsonArrayConst>()) {
      String day = item.as<const char*>();
      day.toLowerCase();
      if (day == dayShort) {
        return true;
      }
    }
    return false;
  }

  if (daysNode.is<const char*>()) {
    String csv = daysNode.as<const char*>();
    csv.toLowerCase();
    return csvHasDay(csv, dayShort);
  }

  return false;
}

String dayShortName(int weekday) {
  switch (weekday) {
    case 0:
      return "sun";
    case 1:
      return "mon";
    case 2:
      return "tue";
    case 3:
      return "wed";
    case 4:
      return "thu";
    case 5:
      return "fri";
    default:
      return "sat";
  }
}

void publishZoneState(JsonObject zone) {
  const String id = String(zone["id"] | "");
  const bool active = zone["active"] | false;
  mqttClient.publish(zoneStateTopic(id).c_str(), active ? "ON" : "OFF", true);
}

void publishControllerState() {
  StaticJsonDocument<256> state;
  state["online"] = true;
  state["timeSynced"] = (time(nullptr) > 1700000000);
  state["relayByte"] = relayStateByte();

  char payload[256];
  const size_t n = serializeJson(state, payload, sizeof(payload));
  mqttClient.publish(controllerStateTopic().c_str(), reinterpret_cast<const uint8_t*>(payload), n, true);
}

void publishAvailability(bool force = false) {
  if (!mqttClient.connected()) {
    return;
  }

  if (!force && (millis() - lastAvailabilityMs < kAvailabilityRefreshMs)) {
    return;
  }

  if (mqttClient.publish(availabilityTopic().c_str(), "online", true)) {
    lastAvailabilityMs = millis();
  }
}

void publishDiscovery() {
  StaticJsonDocument<512> doc;
  String payload;

  JsonArray zones = configDoc["zones"].as<JsonArray>();
  for (JsonObject zone : zones) {
    const String zoneId = String(zone["id"] | "");
    const String zoneName = String(zone["name"] | "Zone");

    doc.clear();
    doc["name"] = zoneName;
    doc["uniq_id"] = deviceId() + "_zone_" + zoneId;
    doc["cmd_t"] = zoneCommandTopic(zoneId);
    doc["stat_t"] = zoneStateTopic(zoneId);
    doc["pl_on"] = "ON";
    doc["pl_off"] = "OFF";
    doc["avty_t"] = availabilityTopic();
    doc["pl_avail"] = "online";
    doc["pl_not_avail"] = "offline";

    JsonObject device = doc["dev"].to<JsonObject>();
    device["name"] = deviceId();
    device["ids"] = deviceId();
    device["mf"] = "Irrigate";
    device["mdl"] = "Adafruit HUZZAH";

    payload = "";
    serializeJson(doc, payload);

    String discoveryTopic = "homeassistant/switch/" + deviceId() + "/zone_" + zoneId + "/config";
    mqttClient.publish(discoveryTopic.c_str(), payload.c_str(), true);
  }

  doc.clear();
  doc["name"] = "Soil Moisture";
  doc["uniq_id"] = deviceId() + "_soil_moisture";
  doc["stat_t"] = soilTelemetryTopic();
  doc["unit_of_meas"] = "%";
  doc["dev_cla"] = "moisture";
  doc["avty_t"] = availabilityTopic();
  doc["pl_avail"] = "online";
  doc["pl_not_avail"] = "offline";

  JsonObject device = doc["dev"].to<JsonObject>();
  device["name"] = deviceId();
  device["ids"] = deviceId();
  device["mf"] = "Irrigate";
  device["mdl"] = "Adafruit HUZZAH";

  payload = "";
  serializeJson(doc, payload);
  String moistureDiscoveryTopic = "homeassistant/sensor/" + deviceId() + "/soil_moisture/config";
  mqttClient.publish(moistureDiscoveryTopic.c_str(), payload.c_str(), true);
}

void applyZoneCommand(const String& zoneId, bool isOn) {
  JsonArray zones = configDoc["zones"].as<JsonArray>();
  Serial.printf("MQTT: applying zone command zone=%s isOn=%d\n", zoneId.c_str(), isOn);
  Serial.println("nubmer of zones: " + String(zones.size()));
  for (JsonObject zone : zones) {
    if (zoneId != String(zone["id"] | "")) {
      Serial.printf("MQTT: skipping zone %s\n", String(zone["id"] | "").c_str());
      continue;
    }
    Serial.printf("MQTT: found zone %s, applying command isOn=%d\n", zoneId.c_str(), isOn);

    const uint8_t channel = zone["channel"] | 0;
    if (isOn) {
      Serial.printf("MQTT: zone=%s channel=%u ON\n", zoneId.c_str(), channel);
      relayChannelOn(channel);
      zone["active"] = true;
      const int durationMin = zone["schedule"]["durationMin"] | zone["schedule"]["duration"] | 10;
      zone["activeUntil"] = static_cast<int64_t>(time(nullptr) + durationMin * 60);
    } else {
      relayChannelOff(channel);
      zone["active"] = false;
      zone.remove("activeUntil");
    }

    publishZoneState(zone);
    saveControllerConfig(configDoc);
    return;
  }
}

void handleMqttMessage(char* topic, uint8_t* payload, unsigned int len) {
  String topicStr(topic);
  String body;
  topicStr.trim();
  for (unsigned int i = 0; i < len; i++) {
    body += static_cast<char>(payload[i]);
  }
  Serial.printf("MQTT RX: topic=%s body=%s\n", topicStr.c_str(), body.c_str());

  const String topicNoSlash = topicStr.startsWith("/") ? topicStr.substring(1) : topicStr;
  const String configTopic = configSetTopic();
  const String configAltTopic = "/" + configTopic;
  if (topicStr == configTopic || topicStr == configAltTopic || topicNoSlash == configTopic) {
    body.trim();
    if (body.length() == 0) {
      Serial.println("MQTT: ignoring empty config payload");
      return;
    }

    DynamicJsonDocument incoming(8192);
    DeserializationError err = deserializeJson(incoming, body);
    if (err) {
      Serial.printf("MQTT: invalid config payload: %s\n", err.c_str());
      return;
    }

    configDoc.clear();
    configDoc.set(incoming.as<JsonObjectConst>());
    saveControllerConfig(configDoc);

    const uint8_t i2cAddress = configDoc["relay"]["i2cAddress"] | 39;
    const uint8_t channels = configDoc["relay"]["channels"] | 8;
    initRelayDriver(i2cAddress, channels);
    relayAllOff();

    Serial.printf("MQTT: applied config from server, zones=%d\n", configDoc["zones"].size());
    publishDiscovery();
    publishControllerState();
    return;
  }

  Serial.printf("MQTT: checking for zone command, topic=%s\n", topicStr.c_str());
  const String prefix = baseTopic() + "/zone/";
  const String prefixAlt = "/" + prefix;
  const String suffix = "/set";
  const bool zoneMatches = (topicStr.startsWith(prefix) && topicStr.endsWith(suffix)) ||
                          (topicStr.startsWith(prefixAlt) && topicStr.endsWith(suffix)) ||
                          (topicNoSlash.startsWith(prefix) && topicNoSlash.endsWith(suffix));
  Serial.printf("MQTT: zoneMatches=%d\n", zoneMatches);
  if (zoneMatches) {
    const String zoneTopic = topicStr.startsWith("/") ? topicStr.substring(1) : topicStr;
    const int idStart = prefix.length();
    const int idEnd = zoneTopic.length() - suffix.length();
    const String zoneId = zoneTopic.substring(idStart, idEnd);
    const bool turnOn = body == "ON" || body == "on" || body == "1";
    Serial.printf("MQTT: zone command zone=%s turnOn=%d\n", zoneId.c_str(), turnOn);
    applyZoneCommand(zoneId, turnOn);
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.printf("WiFi: connecting to %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint8_t retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print('.');
    retries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi: connected, ip=%s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("WiFi: connection failed, running offline mode");
  }
}

void syncRtcFromNtp() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  const char* tz = configDoc["timezone"] | "UTC0";
  setenv("TZ", tz, 1);
  tzset();

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm nowInfo;
  if (!getLocalTime(&nowInfo, 5000)) {
    Serial.println("Time: NTP sync failed");
    return;
  }

  lastNtpSyncMs = millis();
  Serial.printf("Time: synced %04d-%02d-%02d %02d:%02d\n", nowInfo.tm_year + 1900,
                nowInfo.tm_mon + 1, nowInfo.tm_mday, nowInfo.tm_hour, nowInfo.tm_min);
}

bool connectMqtt() {
  if (mqttClient.connected()) {
    return true;
  }

  if (millis() - lastMqttReconnectAttemptMs < kMqttReconnectIntervalMs) {
    return false;
  }
  lastMqttReconnectAttemptMs = millis();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(handleMqttMessage);

  const String clientId = mqttClientId();
  const String willTopic = availabilityTopic();

  bool connected = false;
  if (String(MQTT_USERNAME).length() > 0) {
    connected = mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD, willTopic.c_str(), 1,
                                   true, "offline");
  } else {
    connected = mqttClient.connect(clientId.c_str(), willTopic.c_str(), 1, true, "offline");
  }

  if (!connected) {
    Serial.printf("MQTT: connect failed rc=%d\n", mqttClient.state());
    return false;
  }

  publishAvailability(true);
  mqttClient.subscribe(configSetTopic().c_str());
  mqttClient.subscribe(("/" + configSetTopic()).c_str());
  mqttClient.subscribe((baseTopic() + "/zone/+/set").c_str());
  mqttClient.subscribe(("/" + baseTopic() + "/zone/+/set").c_str());

  publishDiscovery();
  publishControllerState();

  JsonArray zones = configDoc["zones"].as<JsonArray>();
  for (JsonObject zone : zones) {
    publishZoneState(zone);
  }

  Serial.println("MQTT: connected");
  return true;
}

void publishTelemetry() {
  const int raw = analogRead(kSoilMoisturePin);
  const float normalized = static_cast<float>(raw) / 4095.0f;
  const int moisture = constrain(static_cast<int>((1.0f - normalized) * 100.0f), 0, 100);

  char text[8];
  itoa(moisture, text, 10);
  mqttClient.publish(soilTelemetryTopic().c_str(), text, true);
}

void runSchedulerTick() {
  time_t epoch = time(nullptr);
  if (epoch < 1700000000) {
    return;
  }

  struct tm local;
  localtime_r(&epoch, &local);

  JsonArray zones = configDoc["zones"].as<JsonArray>();
  for (JsonObject zone : zones) {
    const bool active = zone["active"] | false;
    if (active) {
      const int64_t activeUntil = zone["activeUntil"] | 0;
      if (activeUntil > 0 && epoch >= activeUntil) {
        const uint8_t channel = zone["channel"] | 0;
        relayChannelOff(channel);
        zone["active"] = false;
        zone.remove("activeUntil");
        publishZoneState(zone);
      }
    }
  }

  if (local.tm_min == lastMinute) {
    return;
  }
  lastMinute = local.tm_min;

  const char timeText[6] = {
      static_cast<char>('0' + (local.tm_hour / 10)),
      static_cast<char>('0' + (local.tm_hour % 10)),
      ':',
      static_cast<char>('0' + (local.tm_min / 10)),
      static_cast<char>('0' + (local.tm_min % 10)),
      '\0',
  };

  String today = dayShortName(local.tm_wday);

  for (JsonObject zone : zones) {
    if (!(zone["enabled"] | false)) {
      continue;
    }

    JsonObject schedule = zone["schedule"].as<JsonObject>();
    const String startTime = String(schedule["startTime"] | "00:00");
    if (startTime != String(timeText)) {
      continue;
    }

    if (!zoneScheduledToday(schedule["days"], today)) {
      continue;
    }

    const uint8_t channel = zone["channel"] | 0;
    const int durationMin = schedule["durationMin"] | schedule["duration"] | 10;

    relayChannelOn(channel);
    zone["active"] = true;
    zone["activeUntil"] = static_cast<int64_t>(epoch + durationMin * 60);
    publishZoneState(zone);

    Serial.printf("Scheduler: zone=%s start=%s duration=%d\n", String(zone["id"] | "").c_str(),
                  startTime.c_str(), durationMin);
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);
  if (mqttClient.setBufferSize(kMqttPacketBufferSize)) {
    Serial.printf("MQTT: packet buffer set to %u bytes\n", kMqttPacketBufferSize);
  } else {
    Serial.printf("MQTT: failed to set packet buffer to %u bytes\n", kMqttPacketBufferSize);
  }
  Serial.println("config topic: " + configSetTopic());
  if (!initConfigStore()) {
    Serial.println("Boot: config store init failed");
  }
  if (!loadControllerConfig(configDoc)) {
    Serial.println("Boot: load config failed, writing defaults");
    DynamicJsonDocument defaults(8192);
    deserializeJson(defaults, getDefaultConfigJson());
    configDoc.clear();
    configDoc.set(defaults.as<JsonObjectConst>());
    saveControllerConfig(configDoc);
  }

  const uint8_t i2cAddress = configDoc["relay"]["i2cAddress"] | 39;
  const uint8_t channels = configDoc["relay"]["channels"] | 8;
  initRelayDriver(i2cAddress, channels);

  connectWifi();
  syncRtcFromNtp();
  connectMqtt();

  Serial.println("Boot: controller started");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastNtpSyncMs >= kNtpSyncIntervalMs) {
    syncRtcFromNtp();
  }

  if (!mqttClient.connected()) {
    connectMqtt();
  }
  mqttClient.loop();
  publishAvailability();

  if (millis() - lastSchedulerTickMs >= kSchedulerTickMs) {
    lastSchedulerTickMs = millis();
    runSchedulerTick();
  }

  if (mqttClient.connected() && millis() - lastTelemetryMs >= kTelemetryIntervalMs) {
    lastTelemetryMs = millis();
    publishTelemetry();
    publishAvailability();
    publishControllerState();
  }
}
