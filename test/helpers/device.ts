/**
 * Device test helpers
 *
 * Drive DysonDevice state the way production does (MQTT messages on the mock
 * client), plus one escape hatch for state the codec cannot produce.
 */

import type { DeviceState, DysonDevice } from '../../src/devices/index.js';
import type { MqttMessage } from '../../src/protocol/mqttClient.js';
import type { MockDysonMqttClient } from './mocks.js';

/**
 * Emit a parsed MQTT message on the mock client, as DysonMqttClient would.
 */
export function emitMqttMessage(client: MockDysonMqttClient, data: Record<string, unknown>): void {
  const message: MqttMessage = {
    topic: '438/ABC-AB-12345678/status/current',
    payload: Buffer.from(JSON.stringify(data)),
    data,
  };
  client._emit('message', message);
}

/**
 * Emit a CURRENT-STATE message carrying raw product-state fields (e.g. `{ ffoc: 'ON' }`).
 */
export function emitProductState(client: MockDysonMqttClient, productState: Record<string, string>): void {
  emitMqttMessage(client, { msg: 'CURRENT-STATE', 'product-state': productState });
}

/**
 * Emit an ENVIRONMENTAL-CURRENT-SENSOR-DATA message (e.g. `{ tact: '2950', p25r: '0012' }`).
 */
export function emitSensorData(client: MockDysonMqttClient, data: Record<string, string>): void {
  emitMqttMessage(client, { msg: 'ENVIRONMENTAL-CURRENT-SENSOR-DATA', data });
}

/**
 * Inject arbitrary device state, bypassing the codec.
 *
 * Use only for values the MQTT path cannot produce (undefined, out-of-range,
 * fields no message carries). By default the state is written silently, like
 * a cached reading the service has not been told about yet; pass
 * `{ emit: true }` to go through DysonDevice.updateState() and fire
 * `stateChange` as a real update would.
 */
export function setDeviceState(
  device: DysonDevice,
  partial: Partial<DeviceState>,
  options: { emit?: boolean } = {},
): void {
  const internals = device as unknown as {
    state: DeviceState;
    updateState(partial: Partial<DeviceState>): void;
  };
  if (options.emit) {
    internals.updateState(partial);
  } else {
    Object.assign(internals.state, partial);
  }
}

/** A STATE-SET command as DysonDevice.sendCommand() publishes it */
export interface SentCommand {
  msg: string;
  time: string;
  'mode-reason': string;
  data: Record<string, unknown>;
}

/**
 * The command passed to the mock client's `publishCommand` on call `index`.
 */
export function sentCommand(client: MockDysonMqttClient, index = 0): SentCommand {
  return client.publishCommand.mock.calls[index][0] as SentCommand;
}
