#include "config_store.h"

#include <LittleFS.h>

namespace {
constexpr const char* kConfigPath = "/controller_config.json";

String defaultConfigText() {
  StaticJsonDocument<512> doc;
  doc["version"] = 1;
  doc["deviceId"] = "irrigate-feather-1";
  doc["timezone"] = "UTC";

  JsonObject relay = doc["relay"].to<JsonObject>();
  relay["i2cAddress"] = 39;
  relay["channels"] = 8;

  JsonArray zones = doc["zones"].to<JsonArray>();
  for (uint8_t i = 1; i <= 8; i++) {
    JsonObject zone = zones.add<JsonObject>();
    zone["id"] = i;
    zone["name"] = String("Zone ") + i;
    zone["channel"] = i;
    zone["enabled"] = false;
    JsonObject schedule = zone["schedule"].to<JsonObject>();
    schedule["days"] = "mon,wed,fri";
    schedule["startTime"] = "06:00";
    schedule["durationMin"] = 10;
  }

  String out;
  serializeJsonPretty(doc, out);
  return out;
}
}  // namespace

bool initConfigStore() {
  if (!LittleFS.begin(true)) {
    Serial.println("ConfigStore: LittleFS init failed");
    return false;
  }

  if (!LittleFS.exists(kConfigPath)) {
    File file = LittleFS.open(kConfigPath, "w");
    if (!file) {
      Serial.println("ConfigStore: cannot create default config file");
      return false;
    }
    const String defaults = defaultConfigText();
    file.print(defaults);
    file.close();
    Serial.println("ConfigStore: wrote default config");
  }

  return true;
}

bool loadControllerConfig(JsonDocument& doc) {
  File file = LittleFS.open(kConfigPath, "r");
  if (!file) {
    Serial.println("ConfigStore: failed to open config for reading");
    return false;
  }

  DeserializationError err = deserializeJson(doc, file);
  file.close();
  if (err) {
    Serial.printf("ConfigStore: invalid JSON: %s\n", err.c_str());
    return false;
  }

  return true;
}

bool saveControllerConfig(const JsonDocument& doc) {
  File file = LittleFS.open(kConfigPath, "w");
  if (!file) {
    Serial.println("ConfigStore: failed to open config for writing");
    return false;
  }

  serializeJsonPretty(doc, file);
  file.close();
  Serial.println("ConfigStore: persisted config to flash");
  return true;
}

String getDefaultConfigJson() {
  return defaultConfigText();
}
