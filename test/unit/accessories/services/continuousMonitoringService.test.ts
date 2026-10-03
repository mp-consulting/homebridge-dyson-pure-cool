/**
 * ContinuousMonitoringService Unit Tests
 */

import { vi, type Mock } from 'vitest';

import { ContinuousMonitoringService } from '../../../../src/accessories/services/continuousMonitoringService.js';
import type { ContinuousMonitoringServiceConfig } from '../../../../src/accessories/services/continuousMonitoringService.js';
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

describe('ContinuousMonitoringService', () => {
  let continuousMonitoringService: ContinuousMonitoringService;
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

    const config: ContinuousMonitoringServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    continuousMonitoringService = new ContinuousMonitoringService(config);

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
    it('should create Switch service with continuous-monitoring subtype', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalled();
      expect(mockAccessory.addService).toHaveBeenCalled();
    });

    it('should set configured name to Continuous Monitoring', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Continuous Monitoring',
      );
    });

    it('should register On characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.On);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(continuousMonitoringService.getService()).toBe(mockService);
    });
  });

  describe('On characteristic', () => {
    it('should return true by default when state is not set', () => {
      // Default to true since most users want continuous monitoring on
      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should return false when continuous monitoring is explicitly off', async () => {
      // Simulate state change from device
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'OFF' } },
      });

      const result = onGetHandler();
      expect(result).toBe(false);
    });

    it('should return true when continuous monitoring is on', async () => {
      // Simulate state change from device
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'ON' } },
      });

      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should call setContinuousMonitoring(true) when set to true', async () => {
      await onSetHandler(true);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rhtm: 'ON' },
        }),
      );
    });

    it('should call setContinuousMonitoring(false) when set to false', async () => {
      await onSetHandler(false);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rhtm: 'OFF' },
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
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'OFF' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.On,
        false,
      );
    });

    it('should update characteristic when continuous monitoring turns on', async () => {
      // First turn off
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'OFF' } },
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'ON' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.On,
        true,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update characteristic from current device state', async () => {
      // Set device state
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'CURRENT-STATE', 'product-state': { rhtm: 'ON' } },
      });

      mockService.updateCharacteristic.mockClear();

      continuousMonitoringService.updateFromState();

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.On,
        true,
      );
    });
  });

  describe('error handling', () => {
    it('should log and throw HapStatusError when setContinuousMonitoring MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(onSetHandler(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set continuous monitoring: MQTT error');
    });

    it('should throw HapStatusError when setting while the device is disconnected', async () => {
      await device.disconnect();

      await expect(onSetHandler(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to set continuous monitoring:'));
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

      const service = new ContinuousMonitoringService({
        accessory: accessoryWithExistingService,
        device,
        api: mockApi,
        log: mockLog,
      });

      expect(accessoryWithExistingService.getServiceById).toHaveBeenCalledWith(mockApi.hap.Service.Switch, 'continuous-monitoring');
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
      continuousMonitoringService.updateFromState();
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

      continuousMonitoringService.updateFromState();
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.On, expect.any(Boolean));
    });

    it('should push On when the rhtm field changes', () => {
      mockService.updateCharacteristic.mockClear();
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'OFF' } },
      });
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { rhtm: 'ON' } },
      });
      expect(mockService.updateCharacteristic).toHaveBeenLastCalledWith(mockApi.hap.Characteristic.On, true);
    });
  });
});
