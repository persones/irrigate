#include "relay_driver.h"

#include <Wire.h>

namespace {
uint8_t g_i2cAddress = 39;
uint8_t g_channels = 8;
uint8_t g_state = 0;

void flushRelayState() {
  Wire.beginTransmission(g_i2cAddress);
  Wire.write(g_state);
  const uint8_t status = Wire.endTransmission();
  if (status != 0) {
    Serial.printf("Relay: I2C write failed with code %u\n", status);
  }
}

uint8_t channelMask(uint8_t channel) {
  return 1 << (channel - 1);
}

bool validChannel(uint8_t channel) {
  return channel >= 1 && channel <= g_channels;
}
}  // namespace

bool initRelayDriver(uint8_t i2cAddress, uint8_t channels) {
  g_i2cAddress = i2cAddress;
  g_channels = channels;
  Wire.begin();
  g_state = 0;
  flushRelayState();
  Serial.printf("Relay: initialized addr=0x%02X channels=%u\n", g_i2cAddress, g_channels);
  return true;
}

void relayChannelOn(uint8_t channel) {
  if (!validChannel(channel)) {
    return;
  }
  g_state |= channelMask(channel);
  flushRelayState();
}

void relayChannelOff(uint8_t channel) {
  if (!validChannel(channel)) {
    return;
  }
  g_state &= ~channelMask(channel);
  flushRelayState();
}

void relayAllOff() {
  g_state = 0;
  flushRelayState();
}

bool relayChannelState(uint8_t channel) {
  if (!validChannel(channel)) {
    return false;
  }
  return (g_state & channelMask(channel)) != 0;
}

uint8_t relayStateByte() {
  return g_state;
}
