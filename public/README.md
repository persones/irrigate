# Irrigate Runtime Notes

This project now runs as two cooperating services:

1. ESP32 Feather controller firmware in irrigate-contrroller
2. Node server in src/server serving API/UI and syncing config over MQTT

## MQTT Environment Variables

Set these for the Node server process:

- MQTT_URL (default mqtt://127.0.0.1:1883)
- MQTT_USERNAME (optional)
- MQTT_PASSWORD (optional)
- IRRIGATE_DEVICE_ID (default irrigate-feather-1)
- IRRIGATE_TIMEZONE (default UTC0)
- IRRIGATE_RELAY_I2C_ADDRESS (default 39)
- IRRIGATE_RELAY_CHANNELS (default 8)

## MQTT Contracts

Server publishes:

- irrigate/<deviceId>/config/set (retained JSON)
- irrigate/<deviceId>/zone/<zoneId>/set (ON/OFF)

Server subscribes:

- irrigate/<deviceId>/availability
- irrigate/<deviceId>/state
- irrigate/<deviceId>/telemetry/soilMoisture
- irrigate/<deviceId>/zone/+/state

## Home Assistant

Controller publishes MQTT discovery payloads under homeassistant/* topics.
Use the Home Assistant MQTT integration connected to the same broker.
