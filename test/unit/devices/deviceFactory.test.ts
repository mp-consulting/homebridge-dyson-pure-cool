/**
 * Device Factory Unit Tests
 */

import { describe, it, expect } from '@jest/globals';

import { createDevice, isProductTypeSupported, getSupportedProductTypes } from '../../../src/devices/deviceFactory.js';
import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import { createMockMqttClient, createMockMqttClientFactory, DEFAULT_DEVICE_INFO } from '../../helpers/mocks.js';

describe('Device Factory', () => {
  describe('createDevice', () => {
    it('should create a DysonLinkDevice for supported product type', () => {
      const mockClient = createMockMqttClient();
      const factory = createMockMqttClientFactory(mockClient);

      const device = createDevice(DEFAULT_DEVICE_INFO, factory);
      expect(device).toBeInstanceOf(DysonLinkDevice);
    });

    it('should throw for unsupported product type', () => {
      const mockClient = createMockMqttClient();
      const factory = createMockMqttClientFactory(mockClient);

      expect(() =>
        createDevice(
          { ...DEFAULT_DEVICE_INFO, productType: '999' },
          factory,
        ),
      ).toThrow('Unsupported product type');
    });

    it('should create devices for all supported product types', () => {
      const mockClient = createMockMqttClient();
      const factory = createMockMqttClientFactory(mockClient);
      const types = getSupportedProductTypes();

      for (const productType of types) {
        const device = createDevice(
          { ...DEFAULT_DEVICE_INFO, productType },
          factory,
        );
        expect(device).toBeInstanceOf(DysonLinkDevice);
      }
    });
  });

  describe('isProductTypeSupported', () => {
    it('should return true for supported types', () => {
      expect(isProductTypeSupported('438')).toBe(true);
      expect(isProductTypeSupported('455')).toBe(true);
      expect(isProductTypeSupported('527')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(isProductTypeSupported('000')).toBe(false);
    });
  });

  describe('getSupportedProductTypes', () => {
    it('should return a non-empty array', () => {
      const types = getSupportedProductTypes();
      expect(types.length).toBeGreaterThan(0);
    });

    it('should include known product types', () => {
      const types = getSupportedProductTypes();
      expect(types).toContain('438');
      expect(types).toContain('455');
      expect(types).toContain('664');
    });
  });
});
