/**
 * Device Factory
 *
 * Creates the appropriate DysonDevice subclass based on product type.
 */

import type { DeviceInfo } from './types.js';
import type { DysonDevice, MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';
import { DysonLinkDevice } from './dysonLinkDevice.js';

/**
 * Supported product types and their device class
 */
const SUPPORTED_PRODUCT_TYPES: Record<string, 'link'> = {
  // Link series (older models)
  '455': 'link',   // HP02 - Pure Hot+Cool Link
  '438': 'link',   // TP04 - Pure Cool Tower
  '438E': 'link',  // TP07 - Purifier Cool
};

/**
 * Check if a product type is supported
 *
 * @param productType - Dyson product type code
 * @returns True if the product type is supported
 */
export function isProductTypeSupported(productType: string): boolean {
  return productType in SUPPORTED_PRODUCT_TYPES;
}

/**
 * Get list of supported product types
 *
 * @returns Array of supported product type codes
 */
export function getSupportedProductTypes(): string[] {
  return Object.keys(SUPPORTED_PRODUCT_TYPES);
}

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
  const deviceType = SUPPORTED_PRODUCT_TYPES[deviceInfo.productType];

  if (!deviceType) {
    throw new Error(`Unsupported product type: ${deviceInfo.productType}`);
  }

  switch (deviceType) {
    case 'link':
      return new DysonLinkDevice(deviceInfo, mqttClientFactory, mqttConnectFn);
    default:
      // TypeScript exhaustiveness check
      throw new Error(`Unknown device type: ${deviceType}`);
  }
}
