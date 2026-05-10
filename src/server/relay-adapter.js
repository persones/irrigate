/**
 * Relay/I2C abstraction layer.
 *
 * Hardware mode:
 * - Uses an 8-channel I2C relay board on address 0x27.
 * - Writes one byte where channel 1 -> bit 0 ... channel 8 -> bit 7.
 * - Bit value 1 means relay ON.
 *
 * Dev mode:
 * - Falls back to an in-memory mock if i2c-bus is unavailable.
 */

const RELAY_I2C_ADDRESS = 0x27;
const RELAY_CHANNELS = 8;

let i2cBus = null;
let relayStateByte = 0;
let bonescript = null;

try {
  const i2cBusModule = await import('i2c-bus');
  i2cBus = i2cBusModule.openSync(1);
  // Ensure known startup state on board power-up.
  writeRelayState();
  console.log(`Relay-adapter: using i2c relay board at 0x${RELAY_I2C_ADDRESS.toString(16)}`);
} catch (_) {
  console.log('Relay-adapter: i2c-bus not available – running relay mock mode');
}

try {
  bonescript = await import('bonescript');
} catch (_) {
  // Keep analog read support optional in non-BeagleBone environments.
}

function normalizeChannel(channel) {
  const parsed = Number(channel);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > RELAY_CHANNELS) {
    throw new Error(`Invalid relay channel: ${channel}. Expected integer 1-${RELAY_CHANNELS}.`);
  }
  return parsed;
}

function channelMask(channel) {
  return 1 << (channel - 1);
}

function writeRelayState() {
  if (!i2cBus) return;
  try {
    const buffer = Buffer.from([relayStateByte]);
    i2cBus.i2cWriteSync(RELAY_I2C_ADDRESS, 1, buffer);
  } catch (err) {
    console.error('Relay-adapter: failed to write relay state byte:', err.message);
  }
}

/**
 * Register a channel and force it off.
 * @param {number|string} channel
 */
export function setupChannel(channel) {
  const normalized = normalizeChannel(channel);
  setChannelState(normalized, false);
}

function setChannelState(channel, isOn) {
  const normalized = normalizeChannel(channel);
  const mask = channelMask(normalized);
  relayStateByte = isOn ? (relayStateByte | mask) : (relayStateByte & ~mask);
  writeRelayState();
  console.log(
    `relay-adapter: channel ${normalized} -> ${isOn ? 'ON' : 'OFF'}, byte=0b${relayStateByte
      .toString(2)
      .padStart(8, '0')}`,
  );
}

/**
 * Turn a relay channel ON.
 * @param {number|string} channel
 */
export function channelOn(channel) {
  setChannelState(channel, true);
}

/**
 * Turn a relay channel OFF.
 * @param {number|string} channel
 */
export function channelOff(channel) {
  setChannelState(channel, false);
}

/**
 * Read the current logical state of a channel (1 = ON, 0 = OFF).
 * @param {number|string} channel
 * @returns {number}
 */
export function readChannel(channel) {
  const normalized = normalizeChannel(channel);
  const mask = channelMask(normalized);
  return (relayStateByte & mask) !== 0 ? 1 : 0;
}

/**
 * Read an analogue pin value in the range 0–1 (BeagleBone ADC).
 * Returns a random realistic mock value when not on hardware.
 * @param {string} pin  e.g. 'P9_33'
 * @returns {Promise<number>}
 */
export function readAnalog(pin) {
  return new Promise((resolve) => {
    if (bonescript) {
      bonescript.analogRead(pin, (x) => resolve(x.value ?? 0));
    } else {
      // Mock: return a value between 0.2 and 0.8
      resolve(0.2 + Math.random() * 0.6);
    }
  });
}
