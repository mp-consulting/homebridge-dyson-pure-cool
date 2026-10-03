/**
 * DysonLinkDevice Unit Tests
 */

import { vi } from 'vitest';

import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import { createDevice, isProductTypeSupported, getSupportedProductTypes } from '../../../src/devices/deviceFactory.js';
import type { DeviceInfo, MqttClientFactory } from '../../../src/devices/index.js';
import type { MqttMessage } from '../../../src/protocol/mqttClient.js';
import { createMockMqttClient } from '../../helpers/mocks.js';
import { sentCommand } from '../../helpers/device.js';

/** Flush pending microtasks so queued commands are sent before assertions */
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

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
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      await flushMicrotasks();

      // Newer models use fmod only (no auto field)
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { fmod: 'FAN' },
        }),
      );
    });

    it('should send OFF command when turning off', async () => {
      await device.setFanPower(false);
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'OFF' },
        }),
      );
    });
  });

  describe('setFanPower for CF1 (739, fpwr protocol)', () => {
    let cf1Device: DysonLinkDevice;
    let cf1MqttClient: ReturnType<typeof createMockMqttClient>;

    beforeEach(async () => {
      cf1MqttClient = createMockMqttClient();
      cf1Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '739' },
        vi.fn().mockReturnValue(cf1MqttClient),
      );
      await cf1Device.connect();
    });

    it('should send fpwr ON (not fmod) when turning on', async () => {
      await cf1Device.setFanPower(true);
      await flushMicrotasks();

      const command = sentCommand(cf1MqttClient, 0);
      expect(command.data).toMatchObject({ fpwr: 'ON' });
      expect(command.data).not.toHaveProperty('fmod');
    });

    it('should send fpwr OFF (not fmod) when turning off', async () => {
      await cf1Device.setFanPower(false);
      await flushMicrotasks();

      expect(cf1MqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fpwr: 'OFF' },
        }),
      );
    });
  });

  describe('activation defaults', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should not send extra fields when no defaults are configured', async () => {
      await device.setFanPower(true);
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'FAN' },
        }),
      );
    });

    it('should enable configured modes in the same command as power on', async () => {
      device.setActivationDefaults({ autoMode: true, oscillation: true, nightMode: true });

      await device.setFanPower(true);
      await flushMicrotasks();

      // All queued in one tick, so they merge into a single MQTT message.
      // Auto mode wins over the FAN value queued by setFanPower.
      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'AUTO', oson: 'ON', nmod: 'ON' },
        }),
      );
    });

    it('should apply only the modes that are enabled', async () => {
      device.setActivationDefaults({ oscillation: true });

      await device.setFanPower(true);
      await flushMicrotasks();

      const command = sentCommand(mockMqttClient, 0);
      expect(command.data).toMatchObject({ oson: 'ON' });
      expect(command.data).not.toHaveProperty('nmod');
    });

    it('should skip modes the device does not support', async () => {
      const cf1MqttClient = createMockMqttClient();
      const cf1Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '739' },
        vi.fn().mockReturnValue(cf1MqttClient),
      );
      await cf1Device.connect();

      // CF1 is a plain fan with no auto mode; oscillation is supported.
      cf1Device.setActivationDefaults({ autoMode: true, oscillation: true });

      await cf1Device.setFanPower(true);
      await flushMicrotasks();

      const command = sentCommand(cf1MqttClient, 0);
      expect(command.data).toMatchObject({ fpwr: 'ON', oson: 'ON' });
      expect(command.data).toMatchObject({ auto: 'OFF' });
    });

    it('should not re-apply defaults when the device is already on', async () => {
      device.setActivationDefaults({ nightMode: true });

      // Device reports itself as already running
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': { fmod: 'FAN', fnsp: '0005', nmod: 'OFF' },
        },
      };
      mockMqttClient._emit('message', message);

      await device.setFanPower(true);
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).not.toHaveBeenCalled();
    });

    it('should not apply defaults when powering off', async () => {
      device.setActivationDefaults({ nightMode: true, oscillation: true });

      await device.setFanPower(false);
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'OFF' },
        }),
      );
    });

    it('should clear previously configured defaults', async () => {
      device.setActivationDefaults({ nightMode: true });
      device.setActivationDefaults({});

      await device.setFanPower(true);
      await flushMicrotasks();

      const command = sentCommand(mockMqttClient, 0);
      expect(command.data).not.toHaveProperty('nmod');
    });
  });

  describe('setFanSpeed', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should send speed command for valid speed', async () => {
      await device.setFanSpeed(5);
      await flushMicrotasks();

      // Newer models use fnsp and fmod only (no auto field)
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fnsp: '0005', fmod: 'FAN' },
        }),
      );
    });

    it('should clamp speed to minimum 1', async () => {
      await device.setFanSpeed(0);
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fnsp: '0001', fmod: 'FAN' },
        }),
      );
    });

    it('should clamp speed to maximum 10', async () => {
      await device.setFanSpeed(15);
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fnsp: '0010', fmod: 'FAN' },
        }),
      );
    });

    it('should send AUTO command for negative speed', async () => {
      await device.setFanSpeed(-1);
      await flushMicrotasks();

      // Newer models use fmod only (no auto field)
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
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { oson: 'ON' },
        }),
      );
    });

    it('should send OFF command when disabling', async () => {
      await device.setOscillation(false);
      await flushMicrotasks();

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
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nmod: 'ON' },
        }),
      );
    });

    it('should send OFF command when disabling', async () => {
      await device.setNightMode(false);
      await flushMicrotasks();

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
      await flushMicrotasks();

      // Newer models use fmod only (no fpwr/auto fields)
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'AUTO' },
        }),
      );
    });

    it('should send FAN command with speed when disabling', async () => {
      await device.setAutoMode(false);
      await flushMicrotasks();

      // Newer models use fmod and fnsp for manual mode
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fmod: 'FAN', fnsp: '0004' }),
        }),
      );
    });
  });

  describe('command promises', () => {
    it('should reject when the device is not connected', async () => {
      await expect(device.setOscillation(true)).rejects.toThrow('Device not connected');
      expect(mockMqttClient.publishCommand).not.toHaveBeenCalled();
    });

    it('should reject when the MQTT client reports disconnected', async () => {
      await device.connect();
      mockMqttClient.isConnected.mockReturnValue(false);

      await expect(device.setNightMode(true)).rejects.toThrow('Device not connected');
    });

    it('should reject when publishing fails', async () => {
      await device.connect();
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('Publish failed'));

      await expect(device.setJetFocus(true)).rejects.toThrow('Publish failed');
    });

    it('should resolve only after the command has been published', async () => {
      await device.connect();

      await device.setContinuousMonitoring(true);

      // No extra flush needed: the promise settles after publishing
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({ data: { rhtm: 'ON' } }),
      );
    });

    it('should share one publish between setters called in the same tick', async () => {
      await device.connect();

      await Promise.all([
        device.setOscillation(true),
        device.setNightMode(true),
        device.setJetFocus(false),
      ]);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({ data: { oson: 'ON', nmod: 'ON', ffoc: 'OFF' } }),
      );
    });

    it('should reject every batched setter when the shared publish fails', async () => {
      await device.connect();
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('Publish failed'));

      const results = await Promise.allSettled([
        device.setOscillation(true),
        device.setNightMode(true),
      ]);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    });

    it('should use a new batch for setters in a later tick', async () => {
      await device.connect();
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('Publish failed'));

      await expect(device.setOscillation(true)).rejects.toThrow('Publish failed');
      await expect(device.setNightMode(true)).resolves.toBeUndefined();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(2);
      expect(mockMqttClient.publishCommand).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { nmod: 'ON' } }),
      );
    });

    it('should not leave an unhandled rejection when a setter is not awaited', async () => {
      await device.connect();
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('Publish failed'));

      // Fire and forget; a stray unhandled rejection would fail the run
      void device.setOscillation(true).catch(() => {});
      await flushMicrotasks();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('power override after a quick off -> on', () => {
    const stateMessage = (productState: Record<string, string>): MqttMessage => ({
      topic: '438/ABC-AB-12345678/status/current',
      payload: Buffer.from('{}'),
      data: { msg: 'STATE-CHANGE', 'product-state': productState },
    });

    beforeEach(async () => {
      await device.connect();
      // Device reports it is running
      mockMqttClient._emit('message', stateMessage({ fmod: 'FAN', fnsp: '0005' }));
      expect(device.getState().isOn).toBe(true);
    });

    it('should skip ON when the device is already on', async () => {
      await device.setFanPower(true);
      expect(mockMqttClient.publishCommand).not.toHaveBeenCalled();
    });

    it('should send ON after an unconfirmed OFF even though reported isOn is still true', async () => {
      await device.setFanPower(false);
      // The device hasn't reported the OFF yet
      expect(device.getState().isOn).toBe(true);

      await device.setFanPower(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(2);
      expect(sentCommand(mockMqttClient, 0).data).toEqual({ fmod: 'OFF' });
      expect(sentCommand(mockMqttClient, 1).data).toEqual({ fmod: 'FAN' });
    });

    it('should keep the override while the device still reports the stale power state', async () => {
      await device.setFanPower(false);
      // A stale message still reporting ON does not confirm the OFF
      mockMqttClient._emit('message', stateMessage({ fmod: 'FAN' }));

      await device.setFanPower(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(2);
      expect(sentCommand(mockMqttClient, 1).data).toEqual({ fmod: 'FAN' });
    });

    it('should clear the override once a state message confirms the commanded power', async () => {
      await device.setFanPower(false);
      await device.setFanPower(true);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(2);

      // Device confirms the ON we commanded
      mockMqttClient._emit('message', stateMessage({ fmod: 'FAN' }));

      // Back to normal: ON while reported on is skipped again
      await device.setFanPower(true);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(2);
    });

    it('should clear the override when the device confirms OFF', async () => {
      await device.setFanPower(false);
      mockMqttClient._emit('message', stateMessage({ fmod: 'OFF' }));
      // Later the device is switched on elsewhere (e.g. the Dyson app)
      mockMqttClient._emit('message', stateMessage({ fmod: 'FAN' }));

      await device.setFanPower(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleStateMessage', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should parse CURRENT-STATE message with product-state', () => {
      const stateChangeHandler = vi.fn();
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
      mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
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
