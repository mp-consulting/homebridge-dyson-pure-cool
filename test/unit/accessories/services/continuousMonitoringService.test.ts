/**
 * ContinuousMonitoringService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { ContinuousMonitoringService } from '../../../../src/accessories/services/continuousMonitoringService.js';
import type { ContinuousMonitoringServiceConfig } from '../../../../src/accessories/services/continuousMonitoringService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { DysonMqttClient } from '../../../../src/protocol/mqttClient.js';
import type { API, PlatformAccessory, Service, Logging } from 'homebridge';

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

// Create mock HomeKit service
function createMockService() {
  const characteristics = new Map<string, {
    onGet: jest.Mock;
    onSet: jest.Mock;
    setProps: jest.Mock;
    getValue: jest.Mock;
  }>();

  const mockService = {
    setCharacteristic: jest.fn().mockReturnThis(),
    getCharacteristic: jest.fn((char: unknown) => {
      const uuid = typeof char === 'object' && char !== null && 'UUID' in char
        ? (char as { UUID: string }).UUID
        : String(char);
      if (!characteristics.has(uuid)) {
        const charMock = {
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          setProps: jest.fn().mockReturnThis(),
          getValue: jest.fn(),
        };
        characteristics.set(uuid, charMock);
      }
      return characteristics.get(uuid);
    }),
    updateCharacteristic: jest.fn(),
  };

  return mockService as unknown as jest.Mocked<Service>;
}

// Create mock logging
function createMockLog(): Logging {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
  } as unknown as Logging;
}

// Create mock API with hap
function createMockApi() {
  const Characteristic = {
    On: { UUID: 'on-uuid' },
    Name: { UUID: 'name-uuid' },
  };

  const Service = {
    Switch: { UUID: 'switch-uuid' },
  };

  return {
    hap: {
      Service,
      Characteristic,
    },
  } as unknown as API;
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
    mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room',
      getService: jest.fn().mockReturnValue(null),
      getServiceById: jest.fn().mockReturnValue(null),
      addService: jest.fn().mockReturnValue(mockService),
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
    onGetHandler = (onChar!.onGet as jest.Mock).mock.calls[0][0];
    onSetHandler = (onChar!.onSet as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create Switch service with continuous-monitoring subtype', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalled();
      expect(mockAccessory.addService).toHaveBeenCalled();
    });

    it('should set display name to Continuous Monitoring', () => {
      expect(mockService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Name,
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

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rhtm: 'ON' },
        }),
      );
    });

    it('should call setContinuousMonitoring(false) when set to false', async () => {
      await onSetHandler(false);

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
    it('should throw and log error when setContinuousMonitoring fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(onSetHandler(true)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
