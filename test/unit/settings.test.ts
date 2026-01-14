import { describe, expect, it } from '@jest/globals';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DYSON_MQTT_PORT,
  DYSON_MDNS_SERVICE,
  DYSON_PRODUCT_TYPES,
} from '../../src/settings.js';

describe('settings', () => {
  describe('PLATFORM_NAME', () => {
    it('should be DysonPureCool', () => {
      expect(PLATFORM_NAME).toBe('DysonPureCool');
    });
  });

  describe('PLUGIN_NAME', () => {
    it('should match the package name', () => {
      expect(PLUGIN_NAME).toBe('homebridge-dyson-pure-cool');
    });
  });

  describe('DYSON_MQTT_PORT', () => {
    it('should be 1883', () => {
      expect(DYSON_MQTT_PORT).toBe(1883);
    });
  });

  describe('DYSON_MDNS_SERVICE', () => {
    it('should be the correct mDNS service type', () => {
      expect(DYSON_MDNS_SERVICE).toBe('_dyson_mqtt._tcp');
    });
  });

  describe('DYSON_PRODUCT_TYPES', () => {
    it('should contain known Dyson product types', () => {
      expect(DYSON_PRODUCT_TYPES).toHaveProperty('438');
      expect(DYSON_PRODUCT_TYPES).toHaveProperty('527');
      expect(DYSON_PRODUCT_TYPES).toHaveProperty('475');
    });

    it('should have correct model names', () => {
      expect(DYSON_PRODUCT_TYPES['438']).toContain('TP04');
      expect(DYSON_PRODUCT_TYPES['527']).toContain('HP04');
    });

    it('should have at least 10 product types', () => {
      expect(Object.keys(DYSON_PRODUCT_TYPES).length).toBeGreaterThanOrEqual(10);
    });
  });
});
