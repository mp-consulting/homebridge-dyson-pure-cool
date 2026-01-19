/**
 * Device Catalog
 *
 * Centralized registry of all supported Dyson device models.
 * Single source of truth for product types, features, and metadata.
 */

import type { DeviceFeatures } from '../devices/types.js';
import { DEFAULT_FEATURES } from '../devices/types.js';

/**
 * Device series classification
 */
export type DeviceSeries =
  | 'pure-cool-link'      // TP02, DP01 (older Link series)
  | 'pure-cool'           // TP04, TP07, TP09, TP11, DP04
  | 'hot-cool-link'       // HP02 (older Link series)
  | 'hot-cool'            // HP04, HP06, HP07, HP09, HP11
  | 'humidify-cool'       // PH01, PH02, PH03, PH04
  | 'big-quiet';          // BP02, BP03, BP04, BP06

/**
 * Device model definition
 */
export interface DeviceModel {
  /** Product type code (e.g., '438', '527') */
  productType: string;
  /** Human-readable model name */
  modelName: string;
  /** Short model code (e.g., 'TP04', 'HP07') */
  modelCode: string;
  /** Device series classification */
  series: DeviceSeries;
  /** Device features */
  features: DeviceFeatures;
  /** Whether this is a formaldehyde-detecting model */
  formaldehyde: boolean;
}

// ============================================================================
// Feature Templates
// ============================================================================

/**
 * Base features for Pure Cool series
 */
const PURE_COOL_BASE: DeviceFeatures = {
  ...DEFAULT_FEATURES,
  fan: true,
  oscillation: true,
  autoMode: true,
  nightMode: true,
  continuousMonitoring: true,
  temperatureSensor: true,
  humiditySensor: true,
  airQualitySensor: true,
  hepaFilter: true,
  carbonFilter: true,
};

/**
 * Pure Cool Link (older models without jet focus)
 * Uses basic air quality sensors (pact/vact index 0-9)
 */
const FEATURES_PURE_COOL_LINK: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: false,
  basicAirQualitySensor: true,
};

/**
 * Pure Cool with Jet Focus (newer models)
 */
const FEATURES_PURE_COOL_JET: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: true,
};

/**
 * Pure Cool without Jet Focus (TP11 style)
 */
const FEATURES_PURE_COOL_NO_JET: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: false,
};

/**
 * Pure Cool with Formaldehyde sensor
 */
const FEATURES_PURE_COOL_FORMALDEHYDE: DeviceFeatures = {
  ...FEATURES_PURE_COOL_JET,
  no2Sensor: true,
};

/**
 * Hot+Cool Link (older models)
 * Uses basic air quality sensors (pact/vact index 0-9)
 * Has jet focus (diffuse/focused airflow) control
 */
const FEATURES_HOT_COOL_LINK: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: true,
  heating: true,
  basicAirQualitySensor: true,
};

/**
 * Hot+Cool with Jet Focus
 */
const FEATURES_HOT_COOL_JET: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: true,
  heating: true,
};

/**
 * Hot+Cool without Jet Focus (HP11 style)
 */
const FEATURES_HOT_COOL_NO_JET: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: false,
  heating: true,
};

/**
 * Hot+Cool with Formaldehyde sensor
 */
const FEATURES_HOT_COOL_FORMALDEHYDE: DeviceFeatures = {
  ...FEATURES_HOT_COOL_JET,
  no2Sensor: true,
};

/**
 * Humidify+Cool base features
 */
const FEATURES_HUMIDIFY_COOL: DeviceFeatures = {
  ...PURE_COOL_BASE,
  frontAirflow: true,
  humidifier: true,
};

/**
 * Humidify+Cool with Formaldehyde sensor
 */
const FEATURES_HUMIDIFY_COOL_FORMALDEHYDE: DeviceFeatures = {
  ...FEATURES_HUMIDIFY_COOL,
  no2Sensor: true,
};

/**
 * Big+Quiet series (no oscillation, has NO2 sensor)
 */
const FEATURES_BIG_QUIET: DeviceFeatures = {
  ...PURE_COOL_BASE,
  oscillation: false,
  frontAirflow: false,
  no2Sensor: true,
};

// ============================================================================
// Device Catalog
// ============================================================================

/**
 * Complete catalog of all supported Dyson devices
 */
export const DEVICE_CATALOG: readonly DeviceModel[] = [
  // Pure Cool Link Series
  {
    productType: '475',
    modelName: 'Dyson Pure Cool Link Tower',
    modelCode: 'TP02',
    series: 'pure-cool-link',
    features: FEATURES_PURE_COOL_LINK,
    formaldehyde: false,
  },
  {
    productType: '469',
    modelName: 'Dyson Pure Cool Link Desk',
    modelCode: 'DP01',
    series: 'pure-cool-link',
    features: FEATURES_PURE_COOL_LINK,
    formaldehyde: false,
  },

  // Pure Cool Series
  {
    productType: '438',
    modelName: 'Dyson Pure Cool Tower',
    modelCode: 'TP04',
    series: 'pure-cool',
    features: FEATURES_PURE_COOL_JET,
    formaldehyde: false,
  },
  {
    productType: '438E',
    modelName: 'Dyson Purifier Cool',
    modelCode: 'TP07',
    series: 'pure-cool',
    features: FEATURES_PURE_COOL_JET,
    formaldehyde: false,
  },
  {
    productType: '438K',
    modelName: 'Dyson Purifier Cool Formaldehyde',
    modelCode: 'TP09',
    series: 'pure-cool',
    features: FEATURES_PURE_COOL_FORMALDEHYDE,
    formaldehyde: true,
  },
  {
    productType: '438M',
    modelName: 'Dyson Purifier Cool',
    modelCode: 'TP11',
    series: 'pure-cool',
    features: FEATURES_PURE_COOL_NO_JET,
    formaldehyde: false,
  },
  {
    productType: '520',
    modelName: 'Dyson Pure Cool Desk',
    modelCode: 'DP04',
    series: 'pure-cool',
    features: FEATURES_PURE_COOL_JET,
    formaldehyde: false,
  },

  // Hot+Cool Link Series
  {
    productType: '455',
    modelName: 'Dyson Pure Hot+Cool Link',
    modelCode: 'HP02',
    series: 'hot-cool-link',
    features: FEATURES_HOT_COOL_LINK,
    formaldehyde: false,
  },

  // Hot+Cool Series
  {
    productType: '527',
    modelName: 'Dyson Pure Hot+Cool',
    modelCode: 'HP04',
    series: 'hot-cool',
    features: FEATURES_HOT_COOL_JET,
    formaldehyde: false,
  },
  {
    productType: '358K',
    modelName: 'Dyson Pure Hot+Cool Cryptomic',
    modelCode: 'HP06',
    series: 'hot-cool',
    features: FEATURES_HOT_COOL_JET,
    formaldehyde: false,
  },
  {
    productType: '527E',
    modelName: 'Dyson Purifier Hot+Cool',
    modelCode: 'HP07',
    series: 'hot-cool',
    features: FEATURES_HOT_COOL_JET,
    formaldehyde: false,
  },
  {
    productType: '527K',
    modelName: 'Dyson Purifier Hot+Cool Formaldehyde',
    modelCode: 'HP09',
    series: 'hot-cool',
    features: FEATURES_HOT_COOL_FORMALDEHYDE,
    formaldehyde: true,
  },
  {
    productType: '527M',
    modelName: 'Dyson Purifier Hot+Cool',
    modelCode: 'HP11',
    series: 'hot-cool',
    features: FEATURES_HOT_COOL_NO_JET,
    formaldehyde: false,
  },

  // Humidify+Cool Series
  {
    productType: '358',
    modelName: 'Dyson Pure Humidify+Cool',
    modelCode: 'PH01',
    series: 'humidify-cool',
    features: FEATURES_HUMIDIFY_COOL,
    formaldehyde: false,
  },
  {
    productType: '520E',
    modelName: 'Dyson Pure Humidify+Cool',
    modelCode: 'PH02',
    series: 'humidify-cool',
    features: FEATURES_HUMIDIFY_COOL,
    formaldehyde: false,
  },
  {
    productType: '358H',
    modelName: 'Dyson Purifier Humidify+Cool',
    modelCode: 'PH03',
    series: 'humidify-cool',
    features: FEATURES_HUMIDIFY_COOL,
    formaldehyde: false,
  },
  {
    productType: '358J',
    modelName: 'Dyson Purifier Humidify+Cool',
    modelCode: 'PH03',
    series: 'humidify-cool',
    features: FEATURES_HUMIDIFY_COOL,
    formaldehyde: false,
  },
  {
    productType: '358E',
    modelName: 'Dyson Purifier Humidify+Cool Formaldehyde',
    modelCode: 'PH04',
    series: 'humidify-cool',
    features: FEATURES_HUMIDIFY_COOL_FORMALDEHYDE,
    formaldehyde: true,
  },
  {
    productType: '520F',
    modelName: 'Dyson Purifier Humidify+Cool Formaldehyde',
    modelCode: 'PH04',
    series: 'humidify-cool',
    features: FEATURES_HUMIDIFY_COOL_FORMALDEHYDE,
    formaldehyde: true,
  },

  // Big+Quiet Series
  {
    productType: '664',
    modelName: 'Dyson Purifier Big+Quiet',
    modelCode: 'BP02',
    series: 'big-quiet',
    features: FEATURES_BIG_QUIET,
    formaldehyde: false,
  },
  {
    productType: '664B',
    modelName: 'Dyson Purifier Big+Quiet Formaldehyde',
    modelCode: 'BP03',
    series: 'big-quiet',
    features: { ...FEATURES_BIG_QUIET, no2Sensor: true },
    formaldehyde: true,
  },
  {
    productType: '664E',
    modelName: 'Dyson Purifier Big+Quiet Formaldehyde',
    modelCode: 'BP04',
    series: 'big-quiet',
    features: { ...FEATURES_BIG_QUIET, no2Sensor: true },
    formaldehyde: true,
  },
  {
    productType: '664F',
    modelName: 'Dyson Purifier Big+Quiet',
    modelCode: 'BP06',
    series: 'big-quiet',
    features: FEATURES_BIG_QUIET,
    formaldehyde: false,
  },
] as const;

// ============================================================================
// Lookup Utilities
// ============================================================================

/** Map for O(1) product type lookup */
const productTypeMap = new Map<string, DeviceModel>(
  DEVICE_CATALOG.map(device => [device.productType, device]),
);

/**
 * Get device model by product type
 *
 * @param productType - Dyson product type code
 * @returns Device model or undefined if not found
 */
export function getDeviceByProductType(productType: string): DeviceModel | undefined {
  return productTypeMap.get(productType);
}

/**
 * Check if a product type is supported
 *
 * @param productType - Dyson product type code
 * @returns True if product type is supported
 */
export function isProductTypeSupported(productType: string): boolean {
  return productTypeMap.has(productType);
}

/**
 * Get all supported product types
 *
 * @returns Array of product type codes
 */
export function getSupportedProductTypes(): string[] {
  return DEVICE_CATALOG.map(device => device.productType);
}

/**
 * Get device features by product type
 *
 * @param productType - Dyson product type code
 * @returns Device features or default features if not found
 */
export function getDeviceFeatures(productType: string): DeviceFeatures {
  return productTypeMap.get(productType)?.features ?? DEFAULT_FEATURES;
}

/**
 * Get device model name by product type
 *
 * @param productType - Dyson product type code
 * @returns Model name with code (e.g., "Dyson Pure Cool Tower (TP04)")
 */
export function getDeviceModelName(productType: string): string {
  const device = productTypeMap.get(productType);
  if (device) {
    return `${device.modelName} (${device.modelCode})`;
  }
  return `Dyson Device (${productType})`;
}

/**
 * Get product type to model name mapping (for config schema)
 *
 * @returns Record of product type codes to display names
 */
export function getProductTypeDisplayNames(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const device of DEVICE_CATALOG) {
    result[device.productType] = `${device.modelCode} - ${device.modelName}`;
  }
  return result;
}

/**
 * Get devices by series
 *
 * @param series - Device series to filter by
 * @returns Array of devices in that series
 */
export function getDevicesBySeries(series: DeviceSeries): DeviceModel[] {
  return DEVICE_CATALOG.filter(device => device.series === series);
}

/**
 * Get devices with heating capability
 *
 * @returns Array of devices that support heating
 */
export function getHeatingDevices(): DeviceModel[] {
  return DEVICE_CATALOG.filter(device => device.features.heating);
}

/**
 * Get devices with humidifier capability
 *
 * @returns Array of devices that support humidification
 */
export function getHumidifierDevices(): DeviceModel[] {
  return DEVICE_CATALOG.filter(device => device.features.humidifier);
}
