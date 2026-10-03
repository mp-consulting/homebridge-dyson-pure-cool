/**
 * Protocol Layer
 * MQTT communication with Dyson devices
 */

export { DysonMqttClient } from './mqttClient.js';
export type {
  MqttClientOptions,
  MqttMessage,
  MqttClientEvents,
  MqttConnectFn,
} from './mqttClient.js';

export { MessageCodec } from './messageCodec.js';
export {
  FAN_SPEED,
  TEMPERATURE,
  HEATING_TEMP,
  HUMIDITY,
  FILTER,
  FORMAT,
  PROTOCOL,
  PERCENT,
} from './messageCodec.js';
export type {
  RawStateData,
  DysonMessage,
} from './messageCodec.js';
