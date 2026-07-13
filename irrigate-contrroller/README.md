# Irrigate Controller (ESP32 Feather V2)

This folder contains the PlatformIO firmware for an Adafruit ESP32 Feather V2 (or compatible board).

## Responsibilities

- Own relay actuation over I2C
- Execute schedules locally even when server is unavailable
- Persist latest config to onboard flash
- Publish Home Assistant MQTT discovery entities
- Sync RTC from NTP on boot and every hour

## Build Requirements

- PlatformIO CLI or VS Code PlatformIO extension
- MQTT broker reachable from the board
- Wi-Fi credentials

## Configure Secrets

Set compile-time defines in PlatformIO or create local build flags:

- WIFI_SSID
- WIFI_PASSWORD
- MQTT_HOST
- MQTT_PORT
- MQTT_USERNAME (optional)
- MQTT_PASSWORD (optional)

Example override in platformio.ini:

build_flags =
  -D WIFI_SSID=\"my-ssid\"
  -D WIFI_PASSWORD=\"my-password\"
  -D MQTT_HOST=\"192.168.1.20\"
  -D MQTT_PORT=1883

## MQTT Topics

Base prefix:

- irrigate/<deviceId>/...

Controller topics:

- irrigate/<deviceId>/availability (online/offline, retained)
- irrigate/<deviceId>/state (json, retained)
- irrigate/<deviceId>/config/set (json config from server)

Zone topics:

- irrigate/<deviceId>/zone/<zoneId>/set (ON/OFF)
- irrigate/<deviceId>/zone/<zoneId>/state (ON/OFF, retained)

Telemetry:

- irrigate/<deviceId>/telemetry/soilMoisture (0-100, retained)

Home Assistant discovery:

- homeassistant/switch/<deviceId>/zone_<zoneId>/config
- homeassistant/sensor/<deviceId>/soil_moisture/config

## Config Payload

The controller expects the server to publish JSON on config/set with at least:

- version
- deviceId
- timezone
- relay.i2cAddress
- relay.channels
- zones[] (id, name, channel, enabled, schedule)

Schedule supports:

- schedule.startTime in HH:MM
- schedule.durationMin or schedule.duration
- schedule.days as array or csv string using sun..sat

## Run

- pio run
- pio run -t upload
- pio device monitor
