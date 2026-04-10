/**
 * GPIO abstraction layer for BeagleBone Black.
 * Uses the 'bonescript' library when running on real hardware.
 * Falls back to a software mock when not on a BeagleBone.
 */

let bonescript = null;

// Try to load bonescript (only available on BeagleBone hardware)
try {
  bonescript = await import('bonescript');
  console.log('GPIO: using bonescript (hardware mode)');
} catch (_) {
  console.log('GPIO: bonescript not available – running in mock mode');
}

// In-memory state for mock mode
const mockState = {};

/**
 * Configure a pin as OUTPUT and drive it LOW (off).
 * @param {number|string} pin
 */
export function setupPin(pin) {
  if (bonescript) {
    bonescript.pinMode(pin, bonescript.OUTPUT);
    bonescript.digitalWrite(pin, bonescript.LOW);
  } else {
    mockState[pin] = 0;
  }
}

/**
 * Turn a GPIO pin HIGH (zone valve open).
 * @param {number|string} pin
 */
export function pinHigh(pin) {
  if (bonescript) {
    bonescript.digitalWrite(pin, bonescript.HIGH);
  } else {
    mockState[pin] = 1;
  }
}

/**
 * Turn a GPIO pin LOW (zone valve closed).
 * @param {number|string} pin
 */
export function pinLow(pin) {
  if (bonescript) {
    bonescript.digitalWrite(pin, bonescript.LOW);
  } else {
    mockState[pin] = 0;
  }
}

/**
 * Read the current logical state of a pin (1 = HIGH, 0 = LOW).
 * @param {number|string} pin
 * @returns {number}
 */
export function readPin(pin) {
  if (bonescript) {
    return bonescript.digitalRead(pin);
  }
  return mockState[pin] ?? 0;
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
