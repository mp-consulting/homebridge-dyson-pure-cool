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
 * All Dyson purifiers use the same MQTT protocol
 */
const SUPPORTED_PRODUCT_TYPES: Record<string, 'link'> = {
  // Pure Cool Link Tower (TP02)
  '475': 'link',

  // Pure Cool Link Desk (DP01)
  '469': 'link',

  // Pure Cool Tower (TP04, TP06, TP07, TP09)
  '438': 'link',
  '438E': 'link',
  '438K': 'link',
  '358': 'link',
  '358E': 'link',

  // Pure Cool Desk (DP04)
  '520': 'link',

  // Pure Hot+Cool Link (HP02)
  '455': 'link',

  // Pure Hot+Cool (HP04, HP06, HP07, HP09)
  '527': 'link',
  '527E': 'link',
  '527K': 'link',
  '358K': 'link',

  // Purifier Humidify+Cool (PH01, PH02, PH03, PH04)
  '358J': 'link',
  '520E': 'link',
  '358H': 'link',
  '520F': 'link',

  // Big+Quiet Series (BP02, BP03, BP04, BP06)
  '664': 'link',
  '664B': 'link',
  '664E': 'link',
  '664F': 'link',
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
