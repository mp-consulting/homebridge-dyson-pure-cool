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
 * Used for identifying device capabilities and features.
 */
export const DYSON_PRODUCT_TYPES: Record<string, string> = {
  '438': 'Dyson Pure Cool Tower (TP04)',
  '438E': 'Dyson Pure Cool Tower (TP07)',
  '438K': 'Dyson Pure Cool Tower Formaldehyde (TP09)',
  '520': 'Dyson Pure Cool Desk (DP04)',
  '527': 'Dyson Pure Hot+Cool (HP04)',
  '527E': 'Dyson Pure Hot+Cool (HP07)',
  '527K': 'Dyson Pure Hot+Cool Formaldehyde (HP09)',
  '455': 'Dyson Pure Hot+Cool Link (HP02)',
  '469': 'Dyson Pure Cool Link Desk (DP01)',
  '475': 'Dyson Pure Cool Link Tower (TP02)',
  '664': 'Dyson Purifier Big+Quiet Formaldehyde (BP03)',
  '664E': 'Dyson Purifier Big+Quiet Formaldehyde (BP04)',
};
