/**
 * Configuration Module
 *
 * Centralized exports for platform configuration and device catalog.
 */

// Platform constants
export {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DYSON_MQTT_PORT,
  DYSON_MDNS_SERVICE,
  DYSON_PRODUCT_TYPES,
} from './constants.js';

// Device catalog
export {
  type DeviceSeries,
  type DeviceModel,
  type CommandProtocol,
  DEVICE_CATALOG,
  getDeviceByProductType,
  isProductTypeSupported,
  getSupportedProductTypes,
  getDeviceFeatures,
  getCommandProtocol,
  getDeviceModelName,
  getProductTypeDisplayNames,
  getDevicesBySeries,
  getHeatingDevices,
  getHumidifierDevices,
} from './deviceCatalog.js';
