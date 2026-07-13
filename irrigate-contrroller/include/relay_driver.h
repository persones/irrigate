#pragma once

#include <Arduino.h>

bool initRelayDriver(uint8_t i2cAddress, uint8_t channels);
void relayChannelOn(uint8_t channel);
void relayChannelOff(uint8_t channel);
void relayAllOff();
bool relayChannelState(uint8_t channel);
uint8_t relayStateByte();
