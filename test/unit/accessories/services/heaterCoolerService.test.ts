/**
 * HeaterCoolerService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { HeaterCoolerService } from '../../../../src/accessories/services/heaterCoolerService.js';
import type { HeaterCoolerServiceConfig } from '../../../../src/accessories/services/heaterCoolerService.js';
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
    Active: { UUID: 'active-uuid' },
    CurrentHeaterCoolerState: { UUID: 'current-state-uuid' },
    TargetHeaterCoolerState: { UUID: 'target-state-uuid' },
    CurrentTemperature: { UUID: 'current-temp-uuid' },
    HeatingThresholdTemperature: { UUID: 'heating-threshold-uuid' },
    Name: { UUID: 'name-uuid' },
  };

  const Service = {
    HeaterCooler: { UUID: 'heater-cooler-uuid' },
  };

  return {
    hap: {
      Service,
      Characteristic,
    },
  } as unknown as API;
}

describe('HeaterCoolerService', () => {
  let heaterCoolerService: HeaterCoolerService;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let device: DysonLinkDevice;
  let mockService: ReturnType<typeof createMockService>;
  let mockAccessory: PlatformAccessory;
  let mockLog: Logging;
  let mockApi: API;

  // Store handlers for testing
  let activeGetHandler: () => unknown;
  let activeSetHandler: (value: unknown) => Promise<void>;
  let currentStateGetHandler: () => unknown;
  let targetStateGetHandler: () => unknown;
  let targetStateSetHandler: (value: unknown) => Promise<void>;
  let currentTempGetHandler: () => unknown;
  let heatingThresholdGetHandler: () => unknown;
  let heatingThresholdSetHandler: (value: unknown) => Promise<void>;

  // Use HP02 (455) which has heating
  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '455',
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
      addService: jest.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: HeaterCoolerServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    heaterCoolerService = new HeaterCoolerService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const activeChar = mockService.getCharacteristic(Characteristic.Active);
    activeGetHandler = (activeChar!.onGet as jest.Mock).mock.calls[0][0];
    activeSetHandler = (activeChar!.onSet as jest.Mock).mock.calls[0][0];

    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentHeaterCoolerState);
    currentStateGetHandler = (currentStateChar!.onGet as jest.Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHeaterCoolerState);
    targetStateGetHandler = (targetStateChar!.onGet as jest.Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as jest.Mock).mock.calls[0][0];

    const currentTempChar = mockService.getCharacteristic(Characteristic.CurrentTemperature);
    currentTempGetHandler = (currentTempChar!.onGet as jest.Mock).mock.calls[0][0];

    const heatingThresholdChar = mockService.getCharacteristic(Characteristic.HeatingThresholdTemperature);
    heatingThresholdGetHandler = (heatingThresholdChar!.onGet as jest.Mock).mock.calls[0][0];
    heatingThresholdSetHandler = (heatingThresholdChar!.onSet as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create HeaterCooler service', () => {
      expect(mockAccessory.getService).toHaveBeenCalled();
    });

    it('should set display name', () => {
      expect(mockService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Name,
        'Living Room Heater',
      );
    });

    it('should register all characteristic handlers', () => {
      const Characteristic = mockApi.hap.Characteristic;

      const activeChar = mockService.getCharacteristic(Characteristic.Active);
      expect(activeChar!.onGet).toHaveBeenCalled();
      expect(activeChar!.onSet).toHaveBeenCalled();

      const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentHeaterCoolerState);
      expect(currentStateChar!.onGet).toHaveBeenCalled();

      const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHeaterCoolerState);
      expect(targetStateChar!.onGet).toHaveBeenCalled();
      expect(targetStateChar!.onSet).toHaveBeenCalled();
      expect(targetStateChar!.setProps).toHaveBeenCalled();

      const currentTempChar = mockService.getCharacteristic(Characteristic.CurrentTemperature);
      expect(currentTempChar!.onGet).toHaveBeenCalled();
      expect(currentTempChar!.setProps).toHaveBeenCalled();

      const heatingThresholdChar = mockService.getCharacteristic(Characteristic.HeatingThresholdTemperature);
      expect(heatingThresholdChar!.onGet).toHaveBeenCalled();
      expect(heatingThresholdChar!.onSet).toHaveBeenCalled();
      expect(heatingThresholdChar!.setProps).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(heaterCoolerService.getService()).toBe(mockService);
    });
  });

  describe('Active characteristic', () => {
    it('should return 0 when device is off', () => {
      const result = activeGetHandler();
      expect(result).toBe(0);
    });

    it('should return 0 when device is on but heating is off', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', hmod: 'OFF' } },
      });

      const result = activeGetHandler();
      expect(result).toBe(0);
    });

    it('should return 1 when device is on and heating is enabled', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', hmod: 'HEAT' } },
      });

      const result = activeGetHandler();
      expect(result).toBe(1);
    });

    it('should enable heating when set to 1', async () => {
      await activeSetHandler(1);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmod: 'HEAT' },
        }),
      );
    });

    it('should disable heating when set to 0', async () => {
      await activeSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmod: 'OFF' },
        }),
      );
    });
  });

  describe('CurrentHeaterCoolerState characteristic', () => {
    it('should return INACTIVE (0) when device is off', () => {
      const result = currentStateGetHandler();
      expect(result).toBe(0); // INACTIVE
    });

    it('should return INACTIVE (0) when heating is off', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', hmod: 'OFF' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(0); // INACTIVE
    });

    it('should return HEATING (2) when actively heating', async () => {
      // Set up: current temp 18°C (2911 K*10), target 22°C (2951 K*10)
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'STATE-CHANGE',
          'product-state': {
            fpwr: 'ON',
            hmod: 'HEAT',
            tact: '2911', // ~18°C
            hmax: '2951', // ~22°C
          },
        },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(2); // HEATING
    });

    it('should return IDLE (1) when at target temperature', async () => {
      // Set up: current temp ~22°C, target 22°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'STATE-CHANGE',
          'product-state': {
            fpwr: 'ON',
            hmod: 'HEAT',
            tact: '2951', // ~22°C
            hmax: '2951', // ~22°C
          },
        },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(1); // IDLE
    });
  });

  describe('TargetHeaterCoolerState characteristic', () => {
    it('should return HEAT (1) as only mode', () => {
      const result = targetStateGetHandler();
      expect(result).toBe(1); // HEAT
    });

    it('should handle set (no-op for Dyson)', async () => {
      // This is a no-op since Dyson only supports HEAT mode
      await targetStateSetHandler(1);
      // No error should be thrown
    });
  });

  describe('CurrentTemperature characteristic', () => {
    it('should return 20°C as default when no reading', () => {
      const result = currentTempGetHandler();
      expect(result).toBe(20);
    });

    it('should convert Kelvin*10 to Celsius', async () => {
      // 2931 K*10 = 293.1 K = 19.95°C ≈ 20°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '2931' } },
      });

      const result = currentTempGetHandler();
      expect(result).toBeCloseTo(20, 0);
    });
  });

  describe('HeatingThresholdTemperature characteristic', () => {
    it('should return 20°C as default when not set', () => {
      const result = heatingThresholdGetHandler();
      expect(result).toBe(20);
    });

    it('should convert Kelvin*10 to Celsius', async () => {
      // 2951 K*10 = 295.1 K = 21.95°C ≈ 22°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmax: '2951' } },
      });

      const result = heatingThresholdGetHandler();
      expect(result).toBe(22);
    });

    it('should set target temperature in Kelvin*10', async () => {
      await heatingThresholdSetHandler(22);

      // 22°C = 295.15 K = 2952 K*10
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmax: '2952' },
        }),
      );
    });
  });

  describe('state change handling', () => {
    it('should update all characteristics when state changes', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fpwr: 'ON',
            hmod: 'HEAT',
            tact: '2931',
            hmax: '2951',
          },
        },
      });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.Active,
        1,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHeaterCoolerState,
        expect.any(Number),
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentTemperature,
        expect.any(Number),
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.HeatingThresholdTemperature,
        expect.any(Number),
      );
    });
  });

  describe('updateFromState', () => {
    it('should update all characteristics from current state', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fpwr: 'ON',
            hmod: 'HEAT',
            tact: '2931',
            hmax: '2951',
          },
        },
      });

      mockService.updateCharacteristic.mockClear();

      heaterCoolerService.updateFromState();

      expect(mockService.updateCharacteristic).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw and log error when setHeatingMode fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(activeSetHandler(1)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setTargetTemperature fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(heatingThresholdSetHandler(22)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
