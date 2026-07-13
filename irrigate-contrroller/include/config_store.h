#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

bool initConfigStore();
bool loadControllerConfig(JsonDocument& doc);
bool saveControllerConfig(const JsonDocument& doc);
String getDefaultConfigJson();
