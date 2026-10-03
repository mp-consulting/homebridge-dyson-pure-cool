/**
 * Device Layer Exports
 */

export { DysonDevice } from './dysonDevice.js';
export type { MqttClientFactory } from './dysonDevice.js';

export { DysonLinkDevice } from './dysonLinkDevice.js';

export {
  createDevice,
  isProductTypeSupported,
  getSupportedProductTypes,
} from './deviceFactory.js';

export type {
  DeviceInfo,
  DeviceState,
  DeviceFeatures,
  DeviceEvents,
} from './types.js';

export {
  createDefaultState,
  DEFAULT_FEATURES,
} from './types.js';
