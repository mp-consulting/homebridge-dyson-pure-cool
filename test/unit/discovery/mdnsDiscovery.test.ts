/**
 * MdnsDiscovery Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { MdnsDiscovery } from '../../../src/discovery/mdnsDiscovery.js';
import type { BonjourFactory } from '../../../src/discovery/mdnsDiscovery.js';

// Create mock Bonjour implementation
function createMockBonjour() {
  const eventHandlers: Map<string, ((service: unknown) => void)[]> = new Map();

  const mockBrowser = {
    on: jest.fn((event: string, handler: (service: unknown) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockBrowser;
    }),
    stop: jest.fn(),
  };

  const mockBonjour = {
    find: jest.fn(() => mockBrowser),
    destroy: jest.fn(),
    // Helper to emit events for testing
    _emitService: (service: unknown) => {
      const handlers = eventHandlers.get('up') || [];
      handlers.forEach((handler) => handler(service));
    },
    _browser: mockBrowser,
  };

  return mockBonjour;
}

describe('MdnsDiscovery', () => {
  let discovery: MdnsDiscovery;
  let mockBonjour: ReturnType<typeof createMockBonjour>;
  let mockBonjourFactory: BonjourFactory;

  beforeEach(() => {
    jest.useFakeTimers();
    mockBonjour = createMockBonjour();
    mockBonjourFactory = jest.fn(() => mockBonjour) as unknown as BonjourFactory;
    discovery = new MdnsDiscovery(mockBonjourFactory);
  });

  afterEach(() => {
    jest.useRealTimers();
    discovery.stop();
  });

  describe('discover', () => {
    it('should discover devices and return serial to IP map', async () => {
      const discoverPromise = discovery.discover({ timeout: 5000 });

      // Wait for bonjour to be initialized
      await Promise.resolve();

      // Emit a device
      mockBonjour._emitService({
        name: 'ABC-AB-12345678_dyson_mqtt',
        host: 'device.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      // Fast-forward to timeout
      jest.advanceTimersByTime(5000);

      const devices = await discoverPromise;

      expect(devices).toBeInstanceOf(Map);
      expect(devices.size).toBe(1);
      expect(devices.get('ABC-AB-12345678')).toBe('192.168.1.100');
    });

    it('should handle multiple devices', async () => {
      const discoverPromise = discovery.discover({ timeout: 5000 });

      await Promise.resolve();

      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device1.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      mockBonjour._emitService({
        name: 'XYZ-CD-87654321_dyson_mqtt',
        host: 'device2.local',
        port: 1883,
        addresses: ['192.168.1.101'],
      });

      jest.advanceTimersByTime(5000);

      const devices = await discoverPromise;

      expect(devices.size).toBe(2);
      expect(devices.get('ABC-AB-12345678')).toBe('192.168.1.100');
      expect(devices.get('XYZ-CD-87654321')).toBe('192.168.1.101');
    });

    it('should return empty map when no devices found', async () => {
      const discoverPromise = discovery.discover({ timeout: 1000 });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      expect(devices).toBeInstanceOf(Map);
      expect(devices.size).toBe(0);
    });

    it('should use default timeout of 10 seconds', async () => {
      const discoverPromise = discovery.discover();

      // Should not resolve before 10 seconds
      jest.advanceTimersByTime(9000);

      // Promise should still be pending - emit a device
      await Promise.resolve();
      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      // Now advance past default timeout
      jest.advanceTimersByTime(2000);

      const devices = await discoverPromise;
      expect(devices.size).toBe(1);
    });

    it('should stop early when maxDevices is reached', async () => {
      const discoverPromise = discovery.discover({ timeout: 10000, maxDevices: 1 });

      await Promise.resolve();

      // Emit first device
      mockBonjour._emitService({
        name: 'ABC-AB-11111111',
        host: 'device1.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      const devices = await discoverPromise;

      // Should only have 1 device and cleanup should be called
      expect(devices.size).toBe(1);
      expect(mockBonjour.destroy).toHaveBeenCalled();
    });

    it('should clamp timeout to minimum value', async () => {
      const discoverPromise = discovery.discover({ timeout: 100 }); // Below minimum

      // Should use minimum of 1000ms
      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;
      expect(devices.size).toBe(0);
    });

    it('should clamp timeout to maximum value', async () => {
      const discoverPromise = discovery.discover({ timeout: 120000 }); // Above maximum

      // Should use maximum of 60000ms
      jest.advanceTimersByTime(60000);

      const devices = await discoverPromise;
      expect(devices.size).toBe(0);
    });

    it('should prefer IPv4 addresses over IPv6', async () => {
      const discoverPromise = discovery.discover({ timeout: 1000 });

      await Promise.resolve();

      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device.local',
        port: 1883,
        addresses: ['fe80::1', '192.168.1.100', '::1'],
      });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      expect(devices.get('ABC-AB-12345678')).toBe('192.168.1.100');
    });

    it('should ignore services with invalid serial format', async () => {
      const discoverPromise = discovery.discover({ timeout: 1000 });

      await Promise.resolve();

      mockBonjour._emitService({
        name: 'invalid-serial-format',
        host: 'device.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device2.local',
        port: 1883,
        addresses: ['192.168.1.101'],
      });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      // Only valid device should be found
      expect(devices.size).toBe(1);
      expect(devices.has('ABC-AB-12345678')).toBe(true);
    });

    it('should ignore services without addresses', async () => {
      const discoverPromise = discovery.discover({ timeout: 1000 });

      await Promise.resolve();

      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device.local',
        port: 1883,
        addresses: [],
      });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      expect(devices.size).toBe(0);
    });

    it('should use referer address as fallback', async () => {
      const discoverPromise = discovery.discover({ timeout: 1000 });

      await Promise.resolve();

      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device.local',
        port: 1883,
        addresses: [],
        referer: { address: '192.168.1.100' },
      });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      expect(devices.size).toBe(1);
      expect(devices.get('ABC-AB-12345678')).toBe('192.168.1.100');
    });
  });

  describe('discoverDetailed', () => {
    it('should return detailed device information', async () => {
      const discoverPromise = discovery.discoverDetailed({ timeout: 1000 });

      await Promise.resolve();

      mockBonjour._emitService({
        name: 'ABC-AB-12345678_dyson_mqtt',
        host: 'dyson-device.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      expect(devices).toHaveLength(1);
      expect(devices[0]).toEqual({
        serial: 'ABC-AB-12345678',
        ipAddress: '192.168.1.100',
        hostname: 'dyson-device.local',
        port: 1883,
      });
    });

    it('should avoid duplicate devices', async () => {
      const discoverPromise = discovery.discoverDetailed({ timeout: 1000 });

      await Promise.resolve();

      // Same device reported twice
      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      mockBonjour._emitService({
        name: 'ABC-AB-12345678',
        host: 'device.local',
        port: 1883,
        addresses: ['192.168.1.100'],
      });

      jest.advanceTimersByTime(1000);

      const devices = await discoverPromise;

      expect(devices).toHaveLength(1);
    });
  });

  describe('stop', () => {
    it('should clean up resources when stopped', async () => {
      discovery.discover({ timeout: 10000 });

      await Promise.resolve();

      // Stop before timeout
      discovery.stop();

      expect(mockBonjour._browser.stop).toHaveBeenCalled();
      expect(mockBonjour.destroy).toHaveBeenCalled();
    });

    it('should be safe to call stop multiple times', () => {
      expect(() => {
        discovery.stop();
        discovery.stop();
        discovery.stop();
      }).not.toThrow();
    });

    it('should be safe to call stop before discover', () => {
      expect(() => {
        discovery.stop();
      }).not.toThrow();
    });
  });

  describe('serial extraction', () => {
    it('should handle various serial number formats', async () => {
      const testCases = [
        { name: 'ABC-AB-12345678', expected: 'ABC-AB-12345678' },
        { name: 'abc-ab-12345678', expected: 'ABC-AB-12345678' },
        { name: 'AB-CD-ABCD1234_dyson_mqtt', expected: 'AB-CD-ABCD1234' },
        { name: 'XY1-23-ZYXW9876', expected: 'XY1-23-ZYXW9876' },
      ];

      for (const testCase of testCases) {
        // Create fresh instance for each test
        const freshMockBonjour = createMockBonjour();
        const freshFactory = jest.fn(() => freshMockBonjour) as unknown as BonjourFactory;
        const freshDiscovery = new MdnsDiscovery(freshFactory);

        const discoverPromise = freshDiscovery.discover({ timeout: 1000 });

        await Promise.resolve();

        freshMockBonjour._emitService({
          name: testCase.name,
          host: 'device.local',
          port: 1883,
          addresses: ['192.168.1.100'],
        });

        jest.advanceTimersByTime(1000);

        const devices = await discoverPromise;

        expect(devices.has(testCase.expected)).toBe(true);
      }
    });
  });

  describe('service type', () => {
    it('should search for dyson_mqtt service type', async () => {
      discovery.discover({ timeout: 1000 });

      await Promise.resolve();

      expect(mockBonjour.find).toHaveBeenCalledWith({ type: 'dyson_mqtt' });
    });
  });
});
