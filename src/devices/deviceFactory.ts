/**
 * Device Factory
 *
 * Creates the appropriate DysonDevice subclass based on product type.
 * Uses the device catalog as the single source of truth.
 */

import type { DeviceInfo } from './types.js';
import type { DysonDevice, MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';
import { DysonLinkDevice } from './dysonLinkDevice.js';
import {
  isProductTypeSupported as catalogIsSupported,
  getSupportedProductTypes as catalogGetTypes,
  getDeviceModelName,
} from './deviceCatalog.js';

// Re-export catalog functions for backward compatibility
export { isProductTypeSupported, getSupportedProductTypes } from './deviceCatalog.js';

/**
 * Create a DysonDevice instance for the given device info
 *
 * @param deviceInfo - Device information from discovery
 * @param mqttClientFactory - Optional MQTT client factory (for testing)
 * @param mqttConnectFn - Optional MQTT connect function (for testing)
 * @returns DysonDevice instance
 * @throws Error if product type is not supported
 */
export function createDevice(
  deviceInfo: DeviceInfo,
  mqttClientFactory?: MqttClientFactory,
  mqttConnectFn?: MqttConnectFn,
): DysonDevice {
  if (!catalogIsSupported(deviceInfo.productType)) {
    const modelName = getDeviceModelName(deviceInfo.productType);
    throw new Error(`Unsupported product type: ${modelName}`);
  }

  // All supported Dyson devices use the same MQTT protocol
  // The DysonLinkDevice class handles all models via the catalog features
  return new DysonLinkDevice(deviceInfo, mqttClientFactory, mqttConnectFn);
}
