/**
 * Platform Configuration Constants
 *
 * Core settings for the Homebridge plugin.
 */

import { getProductTypeDisplayNames } from './deviceCatalog.js';

/**
 * Platform name for Homebridge registration.
 * Users will use this name in config.json to configure the plugin.
 */
export const PLATFORM_NAME = 'DysonPureCool';

/**
 * Plugin name as defined in package.json.
 * This must match the package.json "name" field exactly.
 */
export const PLUGIN_NAME = 'homebridge-dyson-pure-cool';

/**
 * Default MQTT port for local Dyson device communication.
 */
export const DYSON_MQTT_PORT = 1883;

/**
 * mDNS service type for discovering Dyson devices on the local network.
 */
export const DYSON_MDNS_SERVICE = '_dyson_mqtt._tcp';

/**
 * Dyson product type codes mapped to device models.
 * Sourced from the centralized device catalog.
 */
export const DYSON_PRODUCT_TYPES: Record<string, string> = getProductTypeDisplayNames();
