# ESP32 Controller Simulator (Node.js)

This simulator mimics the MQTT behavior of the ESP32 irrigation controller so you can test broker connectivity and message flow without hardware.

## What It Simulates

- `irrigate/<deviceId>/availability` (`online`/`offline`, retained)
- `irrigate/<deviceId>/state` (JSON, retained)
- `irrigate/<deviceId>/telemetry/soilMoisture` (`0-100`, retained)
- Subscribes to:
  - `irrigate/<deviceId>/config/set`
  - `irrigate/<deviceId>/zone/+/set`
- Publishes zone states on:
  - `irrigate/<deviceId>/zone/<zoneId>/state` (`ON`/`OFF`, retained)

## Run

From the project root:

```bash
npm run simulate:controller
```

Or directly:

```bash
node src/controller-simulator/index.js
```

## Environment Variables

- `MQTT_URL` (default: `mqtt://127.0.0.1:1883`)
- `MQTT_USERNAME` (optional)
- `MQTT_PASSWORD` (optional)
- `IRRIGATE_DEVICE_ID` (default: `irrigate-feather-1`)
- `SIM_TELEMETRY_INTERVAL_MS` (default: `30000`)
- `SIM_STATE_INTERVAL_MS` (default: `30000`)
- `SIM_ZONE_AUTO_OFF_MS` (default: `0`, disabled)
- `SIM_SOIL_MIN` (default: `20`)
- `SIM_SOIL_MAX` (default: `70`)
- `SIM_VERBOSE` (default: `1`, set `0` to reduce logs)

## Quick Connectivity Test

1. Start your MQTT broker.
2. Run the simulator.
3. Start the app server (`npm run dev`).
4. Check status:

```bash
curl http://localhost:3000/api/status
```

You should see controller availability and telemetry values in the API response.
