/**
 * NightModeService Unit Tests
 */

import { vi, type Mock } from 'vitest';

import { NightModeService } from '../../../../src/accessories/services/nightModeService.js';
import type { NightModeServiceConfig } from '../../../../src/accessories/services/nightModeService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';

// Create mock API with hap
function createMockApi() {
  const Characteristic = {
    On: { UUID: 'on-uuid' },
    Name: { UUID: 'name-uuid' },
    ConfiguredName: { UUID: 'configured-name-uuid' },
  };

  const Service = {
    Switch: { UUID: 'switch-uuid' },
  };

  return createMockHapApi({ Service, Characteristic });
}

/**
 * Flush microtask command queue.
 * Commands are batched via queueMicrotask in DysonLinkDevice.
 */
async function flushCommands(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('NightModeService', () => {
  let nightModeService: NightModeService;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let device: DysonLinkDevice;
  let mockService: ReturnType<typeof createMockService>;
  let mockAccessory: PlatformAccessory;
  let mockLog: Logging;
  let mockApi: API;

  // Store handlers for testing
  let onGetHandler: () => unknown;
  let onSetHandler: (value: unknown) => Promise<void>;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '438',
    name: 'Living Room',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(async () => {
    // Set up mocks
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService(null);
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room',
      getService: vi.fn().mockReturnValue(null),
      getServiceById: vi.fn().mockReturnValue(null),
      addService: vi.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: NightModeServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    nightModeService = new NightModeService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const onChar = mockService.getCharacteristic(Characteristic.On);
    onGetHandler = (onChar!.onGet as Mock).mock.calls[0][0];
    onSetHandler = (onChar!.onSet as Mock).mock.calls[0][0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create Switch service with night-mode subtype', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalled();
      expect(mockAccessory.addService).toHaveBeenCalled();
    });

    it('should set configured name to Night Mode', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Night Mode',
      );
    });

    it('should register On characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.On);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(nightModeService.getService()).toBe(mockService);
    });
  });

  describe('On characteristic', () => {
    it('should return false when night mode is off', () => {
      const result = onGetHandler();
      expect(result).toBe(false);
    });

    it('should return true when night mode is on', async () => {
      // Simulate state change from device
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { nmod: 'ON' } },
      });

      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should call setNightMode(true) when set to true', async () => {
      await onSetHandler(true);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nmod: 'ON' },
        }),
      );
    });

    it('should call setNightMode(false) when set to false', async () => {
      await onSetHandler(false);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nmod: 'OFF' },
        }),
      );
    });
  });

  describe('state change handling', () => {
    it('should update characteristic when device state changes', async () => {
      // Simulate state update
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { nmod: 'ON' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.On,
        true,
      );
    });

    it('should update characteristic when night mode turns off', async () => {
      // First turn on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { nmod: 'ON' } },
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { nmod: 'OFF' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.On,
        false,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update characteristic from current device state', async () => {
      // Set device state
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'CURRENT-STATE', 'product-state': { nmod: 'ON' } },
      });

      mockService.updateCharacteristic.mockClear();

      nightModeService.updateFromState();

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.On,
        true,
      );
    });
  });

  describe('error handling', () => {
    it('should log and throw HapStatusError when setNightMode MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(onSetHandler(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set night mode: MQTT error');
    });

    it('should throw HapStatusError when setting while the device is disconnected', async () => {
      await device.disconnect();

      await expect(onSetHandler(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to set night mode:'));
    });

    it('should throw HapStatusError on GET while the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);

      expect(() => onGetHandler()).toThrow(expect.objectContaining({ hapStatus: -70402 }));
    });
  });

  describe('existing service', () => {
    it('should reuse a cached service without touching its ConfiguredName', () => {
      const existingService = createMockService(null);
      const accessoryWithExistingService = {
        displayName: 'Living Room',
        getServiceById: vi.fn().mockReturnValue(existingService),
        addService: vi.fn(),
      } as unknown as PlatformAccessory;

      const service = new NightModeService({
        accessory: accessoryWithExistingService,
        device,
        api: mockApi,
        log: mockLog,
      });

      expect(accessoryWithExistingService.getServiceById).toHaveBeenCalledWith(mockApi.hap.Service.Switch, 'night-mode');
      expect(accessoryWithExistingService.addService).not.toHaveBeenCalled();
      expect(existingService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(existingService.updateCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        expect.anything(),
      );
      expect(service.getService()).toBe(existingService);
    });
  });

  describe('state de-duplication', () => {
    it('should not re-push an unchanged On value, but updateFromState should', () => {
      nightModeService.updateFromState();
      mockService.updateCharacteristic.mockClear();
      const stateChangeSpy = vi.fn();
      device.on('stateChange', stateChangeSpy);

      // Unrelated state change: On value unchanged
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fnsp: '0007' } },
      });
      expect(stateChangeSpy).toHaveBeenCalled();
      expect(mockService.updateCharacteristic).not.toHaveBeenCalledWith(mockApi.hap.Characteristic.On, expect.anything());

      nightModeService.updateFromState();
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.On, expect.any(Boolean));
    });

    it('should push On when the nmod field changes', () => {
      mockService.updateCharacteristic.mockClear();
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { nmod: 'OFF' } },
      });
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { nmod: 'ON' } },
      });
      expect(mockService.updateCharacteristic).toHaveBeenLastCalledWith(mockApi.hap.Characteristic.On, true);
    });
  });
});
