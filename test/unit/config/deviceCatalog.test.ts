/**
 * Device Catalog Unit Tests
 */

import { describe, it, expect } from '@jest/globals';

import {
  DEVICE_CATALOG,
  getDeviceByProductType,
  isProductTypeSupported,
  getSupportedProductTypes,
  getDeviceFeatures,
  getDeviceModelName,
  getProductTypeDisplayNames,
  getDevicesBySeries,
  getHeatingDevices,
  getHumidifierDevices,
} from '../../../src/config/deviceCatalog.js';
import { DEFAULT_FEATURES } from '../../../src/devices/types.js';

describe('Device Catalog', () => {
  describe('DEVICE_CATALOG', () => {
    it('should contain all expected device models', () => {
      expect(DEVICE_CATALOG.length).toBeGreaterThanOrEqual(22);
    });

    it('should have unique product types', () => {
      const productTypes = DEVICE_CATALOG.map(d => d.productType);
      const uniqueTypes = new Set(productTypes);
      expect(uniqueTypes.size).toBe(productTypes.length);
    });

    it('should have required fields for every device', () => {
      for (const device of DEVICE_CATALOG) {
        expect(device.productType).toBeTruthy();
        expect(device.modelName).toBeTruthy();
        expect(device.modelCode).toBeTruthy();
        expect(device.series).toBeTruthy();
        expect(device.features).toBeDefined();
        expect(typeof device.formaldehyde).toBe('boolean');
      }
    });
  });

  describe('getDeviceByProductType', () => {
    it('should return device for known product type', () => {
      const device = getDeviceByProductType('438');
      expect(device).toBeDefined();
      expect(device!.modelCode).toBe('TP04');
      expect(device!.series).toBe('pure-cool');
    });

    it('should return undefined for unknown product type', () => {
      const device = getDeviceByProductType('999');
      expect(device).toBeUndefined();
    });
  });

  describe('isProductTypeSupported', () => {
    it('should return true for supported types', () => {
      expect(isProductTypeSupported('438')).toBe(true);
      expect(isProductTypeSupported('455')).toBe(true);
      expect(isProductTypeSupported('475')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(isProductTypeSupported('000')).toBe(false);
      expect(isProductTypeSupported('')).toBe(false);
    });
  });

  describe('getSupportedProductTypes', () => {
    it('should return all product type codes', () => {
      const types = getSupportedProductTypes();
      expect(types.length).toBe(DEVICE_CATALOG.length);
      expect(types).toContain('438');
      expect(types).toContain('455');
    });
  });

  describe('getDeviceFeatures', () => {
    it('should return correct features for TP04', () => {
      const features = getDeviceFeatures('438');
      expect(features.fan).toBe(true);
      expect(features.oscillation).toBe(true);
      expect(features.frontAirflow).toBe(true);
      expect(features.heating).toBe(false);
      expect(features.humidifier).toBe(false);
    });

    it('should return correct features for HP04 (heating)', () => {
      const features = getDeviceFeatures('527');
      expect(features.fan).toBe(true);
      expect(features.heating).toBe(true);
      expect(features.humidifier).toBe(false);
    });

    it('should return correct features for PH01 (humidifier)', () => {
      const features = getDeviceFeatures('358');
      expect(features.fan).toBe(true);
      expect(features.heating).toBe(false);
      expect(features.humidifier).toBe(true);
    });

    it('should return correct features for BP02 (Big+Quiet, no oscillation)', () => {
      const features = getDeviceFeatures('664');
      expect(features.fan).toBe(true);
      expect(features.oscillation).toBe(false);
      expect(features.no2Sensor).toBe(true);
    });

    it('should return correct features for Link series (basic sensors)', () => {
      const features = getDeviceFeatures('475');
      expect(features.basicAirQualitySensor).toBe(true);
      expect(features.frontAirflow).toBe(false);
    });

    it('should return DEFAULT_FEATURES for unknown product type', () => {
      const features = getDeviceFeatures('999');
      expect(features).toEqual(DEFAULT_FEATURES);
    });
  });

  describe('getDeviceModelName', () => {
    it('should return model name for known device', () => {
      const name = getDeviceModelName('438');
      expect(name).toContain('TP04');
      expect(name).toContain('Pure Cool');
    });

    it('should return fallback for unknown device', () => {
      const name = getDeviceModelName('999');
      expect(name).toContain('999');
    });
  });

  describe('getProductTypeDisplayNames', () => {
    it('should return mapping for all devices', () => {
      const names = getProductTypeDisplayNames();
      expect(Object.keys(names).length).toBe(DEVICE_CATALOG.length);
      expect(names['438']).toBeDefined();
    });
  });

  describe('getDevicesBySeries', () => {
    it('should return Pure Cool Link devices', () => {
      const devices = getDevicesBySeries('pure-cool-link');
      expect(devices.length).toBeGreaterThan(0);
      for (const device of devices) {
        expect(device.series).toBe('pure-cool-link');
      }
    });

    it('should return Big+Quiet devices', () => {
      const devices = getDevicesBySeries('big-quiet');
      expect(devices.length).toBeGreaterThan(0);
      for (const device of devices) {
        expect(device.series).toBe('big-quiet');
      }
    });
  });

  describe('getHeatingDevices', () => {
    it('should return only devices with heating', () => {
      const devices = getHeatingDevices();
      expect(devices.length).toBeGreaterThan(0);
      for (const device of devices) {
        expect(device.features.heating).toBe(true);
      }
    });

    it('should include HP series devices', () => {
      const devices = getHeatingDevices();
      const modelCodes = devices.map(d => d.modelCode);
      expect(modelCodes).toContain('HP02');
      expect(modelCodes).toContain('HP04');
    });
  });

  describe('getHumidifierDevices', () => {
    it('should return only devices with humidifier', () => {
      const devices = getHumidifierDevices();
      expect(devices.length).toBeGreaterThan(0);
      for (const device of devices) {
        expect(device.features.humidifier).toBe(true);
      }
    });

    it('should include PH series devices', () => {
      const devices = getHumidifierDevices();
      const modelCodes = devices.map(d => d.modelCode);
      expect(modelCodes).toContain('PH01');
    });
  });
});
