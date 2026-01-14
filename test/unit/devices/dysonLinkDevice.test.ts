/**
 * DysonLinkDevice Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import { createDevice, isProductTypeSupported, getSupportedProductTypes } from '../../../src/devices/deviceFactory.js';
import type { DeviceInfo, MqttClientFactory } from '../../../src/devices/index.js';
import type { DysonMqttClient, MqttMessage } from '../../../src/protocol/mqttClient.js';

// Create mock MQTT client
function createMockMqttClient() {
  const eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const mockClient = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockClient;
    }),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribeToStatus: jest.fn().mockResolvedValue(undefined),
    requestCurrentState: jest.fn().mockResolvedValue(undefined),
    publishCommand: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    _emit: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
  };

  return mockClient as unknown as jest.Mocked<DysonMqttClient> & { _emit: (event: string, ...args: unknown[]) => void };
}

describe('DysonLinkDevice', () => {
  let device: DysonLinkDevice;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '438',
    name: 'Living Room',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(() => {
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set product type from device info', () => {
      expect(device.productType).toBe('438');
    });

    it('should set features for TP04 (438)', () => {
      expect(device.supportedFeatures.fan).toBe(true);
      expect(device.supportedFeatures.oscillation).toBe(true);
      expect(device.supportedFeatures.autoMode).toBe(true);
      expect(device.supportedFeatures.nightMode).toBe(true);
      expect(device.supportedFeatures.temperatureSensor).toBe(true);
      expect(device.supportedFeatures.humiditySensor).toBe(true);
      expect(device.supportedFeatures.airQualitySensor).toBe(true);
      expect(device.supportedFeatures.heating).toBe(false);
    });

    it('should set heating feature for HP02 (455)', () => {
      const hp02Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '455' },
        mockMqttClientFactory,
      );

      expect(hp02Device.supportedFeatures.heating).toBe(true);
    });

    it('should set features for TP07 (438E)', () => {
      const tp07Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '438E' },
        mockMqttClientFactory,
      );

      expect(tp07Device.supportedFeatures.fan).toBe(true);
      expect(tp07Device.supportedFeatures.heating).toBe(false);
    });

    it('should use default features for unknown product type', () => {
      const unknownDevice = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '999' },
        mockMqttClientFactory,
      );

      expect(unknownDevice.supportedFeatures.fan).toBe(true);
    });
  });

  describe('setFanPower', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send ON command when turning on', async () => {
      await device.setFanPower(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { fpwr: 'ON' },
        }),
      );
    });

    it('should send OFF command when turning off', async () => {
      await device.setFanPower(false);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fpwr: 'OFF' },
        }),
      );
    });
  });

  describe('setFanSpeed', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send speed command for valid speed', async () => {
      await device.setFanSpeed(5);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fnsp: '0005', fmod: 'FAN' },
        }),
      );
    });

    it('should clamp speed to minimum 1', async () => {
      await device.setFanSpeed(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fnsp: '0001', fmod: 'FAN' },
        }),
      );
    });

    it('should clamp speed to maximum 10', async () => {
      await device.setFanSpeed(15);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fnsp: '0010', fmod: 'FAN' },
        }),
      );
    });

    it('should send AUTO command for negative speed', async () => {
      await device.setFanSpeed(-1);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'AUTO' },
        }),
      );
    });
  });

  describe('setOscillation', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send ON command when enabling', async () => {
      await device.setOscillation(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { oson: 'ON' },
        }),
      );
    });

    it('should send OFF command when disabling', async () => {
      await device.setOscillation(false);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { oson: 'OFF' },
        }),
      );
    });
  });

  describe('setNightMode', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send ON command when enabling', async () => {
      await device.setNightMode(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nmod: 'ON' },
        }),
      );
    });

    it('should send OFF command when disabling', async () => {
      await device.setNightMode(false);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nmod: 'OFF' },
        }),
      );
    });
  });

  describe('setAutoMode', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send AUTO command when enabling', async () => {
      await device.setAutoMode(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'AUTO' },
        }),
      );
    });

    it('should send FAN command with speed when disabling', async () => {
      await device.setAutoMode(false);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fmod: 'FAN' }),
        }),
      );
    });
  });

  describe('handleStateMessage', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should parse CURRENT-STATE message with product-state', () => {
      const stateChangeHandler = jest.fn();
      device.on('stateChange', stateChangeHandler);

      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fpwr: 'ON',
            fnsp: '0005',
            oson: 'ON',
            nmod: 'OFF',
          },
        },
      };

      // Simulate message through MQTT client
      mockMqttClient._emit('message', message);

      const state = device.getState();
      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(5);
      expect(state.oscillation).toBe(true);
      expect(state.nightMode).toBe(false);
    });

    it('should parse STATE-CHANGE message', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'STATE-CHANGE',
          'product-state': {
            fpwr: 'OFF',
          },
        },
      };

      mockMqttClient._emit('message', message);

      expect(device.getState().isOn).toBe(false);
    });

    it('should parse auto mode', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fnsp: 'AUTO',
            fmod: 'AUTO',
          },
        },
      };

      mockMqttClient._emit('message', message);

      const state = device.getState();
      expect(state.fanSpeed).toBe(-1);
      expect(state.autoMode).toBe(true);
    });

    it('should handle message with data field instead of product-state', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          data: {
            fpwr: 'ON',
            fnsp: '0003',
          },
        },
      };

      mockMqttClient._emit('message', message);

      const state = device.getState();
      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(3);
    });

    it('should ignore message without state data', () => {
      const initialState = device.getState();

      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
        },
      };

      mockMqttClient._emit('message', message);

      expect(device.getState()).toEqual(initialState);
    });
  });
});

describe('deviceFactory', () => {
  describe('isProductTypeSupported', () => {
    it('should return true for supported types', () => {
      expect(isProductTypeSupported('455')).toBe(true);
      expect(isProductTypeSupported('438')).toBe(true);
      expect(isProductTypeSupported('438E')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(isProductTypeSupported('999')).toBe(false);
      expect(isProductTypeSupported('')).toBe(false);
    });
  });

  describe('getSupportedProductTypes', () => {
    it('should return array of supported types', () => {
      const types = getSupportedProductTypes();

      expect(types).toContain('455');
      expect(types).toContain('438');
      expect(types).toContain('438E');
    });
  });

  describe('createDevice', () => {
    let mockMqttClient: ReturnType<typeof createMockMqttClient>;
    let mockMqttClientFactory: MqttClientFactory;

    beforeEach(() => {
      mockMqttClient = createMockMqttClient();
      mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    });

    it('should create DysonLinkDevice for 438', () => {
      const deviceInfo: DeviceInfo = {
        serial: 'TEST-123',
        productType: '438',
        name: 'Test',
        credentials: 'creds',
        ipAddress: '192.168.1.1',
      };

      const device = createDevice(deviceInfo, mockMqttClientFactory);

      expect(device).toBeInstanceOf(DysonLinkDevice);
      expect(device.productType).toBe('438');
    });

    it('should create DysonLinkDevice for 455', () => {
      const deviceInfo: DeviceInfo = {
        serial: 'TEST-123',
        productType: '455',
        name: 'Test',
        credentials: 'creds',
        ipAddress: '192.168.1.1',
      };

      const device = createDevice(deviceInfo, mockMqttClientFactory);

      expect(device).toBeInstanceOf(DysonLinkDevice);
      expect(device.supportedFeatures.heating).toBe(true);
    });

    it('should create DysonLinkDevice for 438E', () => {
      const deviceInfo: DeviceInfo = {
        serial: 'TEST-123',
        productType: '438E',
        name: 'Test',
        credentials: 'creds',
        ipAddress: '192.168.1.1',
      };

      const device = createDevice(deviceInfo, mockMqttClientFactory);

      expect(device).toBeInstanceOf(DysonLinkDevice);
    });

    it('should throw error for unsupported product type', () => {
      const deviceInfo: DeviceInfo = {
        serial: 'TEST-123',
        productType: '999',
        name: 'Test',
        credentials: 'creds',
        ipAddress: '192.168.1.1',
      };

      expect(() => createDevice(deviceInfo, mockMqttClientFactory)).toThrow(
        'Unsupported product type: Dyson Device (999)',
      );
    });
  });
});
