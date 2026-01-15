/**
 * ThermostatService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { ThermostatService } from '../../../../src/accessories/services/thermostatService.js';
import type { ThermostatServiceConfig } from '../../../../src/accessories/services/thermostatService.js';
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
    CurrentHeatingCoolingState: {
      UUID: 'current-heating-cooling-state-uuid',
      OFF: 0,
      HEAT: 1,
      COOL: 2,
      AUTO: 3,
    },
    TargetHeatingCoolingState: {
      UUID: 'target-heating-cooling-state-uuid',
      OFF: 0,
      HEAT: 1,
      COOL: 2,
      AUTO: 3,
    },
    CurrentTemperature: { UUID: 'current-temperature-uuid' },
    TargetTemperature: { UUID: 'target-temperature-uuid' },
    TemperatureDisplayUnits: {
      UUID: 'temperature-display-units-uuid',
      CELSIUS: 0,
      FAHRENHEIT: 1,
    },
    Name: { UUID: 'name-uuid' },
  };

  const Service = {
    Thermostat: { UUID: 'thermostat-uuid' },
  };

  return {
    hap: {
      Service,
      Characteristic,
    },
  } as unknown as API;
}

describe('ThermostatService', () => {
  let thermostatService: ThermostatService;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let device: DysonLinkDevice;
  let mockService: ReturnType<typeof createMockService>;
  let mockAccessory: PlatformAccessory;
  let mockLog: Logging;
  let mockApi: API;

  // Store handlers for testing
  let currentStateGetHandler: () => unknown;
  let targetStateGetHandler: () => unknown;
  let targetStateSetHandler: (value: unknown) => Promise<void>;
  let currentTempGetHandler: () => unknown;
  let targetTempGetHandler: () => unknown;
  let targetTempSetHandler: (value: unknown) => Promise<void>;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'HP04-AB-12345678',
    productType: '527',
    name: 'Living Room Heater',
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
      displayName: 'Living Room Heater',
      getService: jest.fn().mockReturnValue(mockService),
      addService: jest.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: ThermostatServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    thermostatService = new ThermostatService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
    currentStateGetHandler = (currentStateChar!.onGet as jest.Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHeatingCoolingState);
    targetStateGetHandler = (targetStateChar!.onGet as jest.Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as jest.Mock).mock.calls[0][0];

    const currentTempChar = mockService.getCharacteristic(Characteristic.CurrentTemperature);
    currentTempGetHandler = (currentTempChar!.onGet as jest.Mock).mock.calls[0][0];

    const targetTempChar = mockService.getCharacteristic(Characteristic.TargetTemperature);
    targetTempGetHandler = (targetTempChar!.onGet as jest.Mock).mock.calls[0][0];
    targetTempSetHandler = (targetTempChar!.onSet as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create Thermostat service', () => {
      expect(mockAccessory.getService).toHaveBeenCalled();
    });

    it('should set display name', () => {
      expect(mockService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Name,
        'Living Room Heater Heater',
      );
    });

    it('should register CurrentHeatingCoolingState characteristic handler', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.CurrentHeatingCoolingState);
      expect(char!.onGet).toHaveBeenCalled();
    });

    it('should register TargetHeatingCoolingState characteristic handlers with valid values', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.TargetHeatingCoolingState);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
      expect(char!.setProps).toHaveBeenCalledWith({
        validValues: [0, 1], // OFF and HEAT only
      });
    });

    it('should register CurrentTemperature characteristic handler with props', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.CurrentTemperature);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.setProps).toHaveBeenCalledWith({
        minValue: -40,
        maxValue: 100,
        minStep: 0.1,
      });
    });

    it('should register TargetTemperature characteristic handlers with props', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.TargetTemperature);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
      expect(char!.setProps).toHaveBeenCalledWith({
        minValue: 1,
        maxValue: 37,
        minStep: 1,
      });
    });

    it('should set temperature display units to Celsius', () => {
      expect(mockService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.TemperatureDisplayUnits,
        0, // CELSIUS
      );
    });

    it('should return the service', () => {
      expect(thermostatService.getService()).toBe(mockService);
    });
  });

  describe('CurrentHeatingCoolingState characteristic', () => {
    it('should return OFF (0) when heating is disabled', () => {
      const result = currentStateGetHandler();
      expect(result).toBe(0);
    });

    it('should return HEAT (1) when heating is enabled', async () => {
      // Simulate heating on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmod: 'HEAT' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(1);
    });
  });

  describe('TargetHeatingCoolingState characteristic', () => {
    it('should return OFF (0) when heating is disabled', () => {
      const result = targetStateGetHandler();
      expect(result).toBe(0);
    });

    it('should return HEAT (1) when heating is enabled', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmod: 'HEAT' } },
      });

      const result = targetStateGetHandler();
      expect(result).toBe(1);
    });

    it('should call setHeating(true) when set to HEAT (1)', async () => {
      await targetStateSetHandler(1);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { hmod: 'HEAT' },
        }),
      );
    });

    it('should call setHeating(false) when set to OFF (0)', async () => {
      await targetStateSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmod: 'OFF' },
        }),
      );
    });
  });

  describe('CurrentTemperature characteristic', () => {
    it('should return 20 as default when temperature is undefined', () => {
      const result = currentTempGetHandler();
      expect(result).toBe(20);
    });

    it('should convert Kelvin*10 to Celsius correctly', async () => {
      // 2932 = 293.2K = 20.05°C, rounded to 20.1
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '2932' } },
      });

      const result = currentTempGetHandler() as number;
      expect(result).toBeCloseTo(20.1, 1);
    });

    it('should handle 0 temperature as default', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '0000' } },
      });

      const result = currentTempGetHandler();
      expect(result).toBe(20); // Default
    });

    it('should handle negative temperature as default', async () => {
      // Negative values shouldn't happen but handle gracefully
      device.state.temperature = -100;
      const result = currentTempGetHandler();
      expect(result).toBe(20); // Default
    });
  });

  describe('TargetTemperature characteristic', () => {
    it('should return 20 as default when target temperature is undefined', () => {
      const result = targetTempGetHandler();
      expect(result).toBe(20);
    });

    it('should convert Kelvin*10 to Celsius and round to integer', async () => {
      // 2981 = 298.1K = 24.95°C, rounded to 25
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmax: '2981' } },
      });

      const result = targetTempGetHandler();
      expect(result).toBe(25);
    });

    it('should clamp target temperature to minimum (1°C)', async () => {
      // Very low Kelvin value that would result in below 1°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmax: '2700' } },
      });

      const result = targetTempGetHandler();
      expect(result).toBe(1); // Clamped to min
    });

    it('should clamp target temperature to maximum (37°C)', async () => {
      // Very high Kelvin value that would result in above 37°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmax: '3200' } },
      });

      const result = targetTempGetHandler();
      expect(result).toBe(37); // Clamped to max
    });

    it('should call setTargetTemperature when set', async () => {
      await targetTempSetHandler(25);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmax: '2982' }, // 25°C = 298.15K, rounded = 2982
        }),
      );
    });
  });

  describe('state change handling', () => {
    it('should update all characteristics when device state changes', async () => {
      // Simulate full state update
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            hmod: 'HEAT',
            tact: '2952', // ~22°C
            hmax: '2981', // 25°C
          },
        },
      });

      const Characteristic = mockApi.hap.Characteristic;

      // Characteristics should be updated
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHeatingCoolingState,
        1, // HEAT
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.TargetHeatingCoolingState,
        1, // HEAT
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentTemperature,
        expect.any(Number),
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.TargetTemperature,
        25,
      );
    });

    it('should update characteristics when heating turns off', async () => {
      // First turn on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmod: 'HEAT' } },
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmod: 'OFF' } },
      });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHeatingCoolingState,
        0, // OFF
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.TargetHeatingCoolingState,
        0, // OFF
      );
    });
  });

  describe('updateFromState', () => {
    it('should update all characteristics from current device state', async () => {
      // Set device state
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            hmod: 'HEAT',
            tact: '2932', // ~20°C
            hmax: '2961', // ~23°C
          },
        },
      });

      mockService.updateCharacteristic.mockClear();

      thermostatService.updateFromState();

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHeatingCoolingState,
        1, // HEAT
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.TargetHeatingCoolingState,
        1, // HEAT
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentTemperature,
        expect.any(Number),
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.TargetTemperature,
        23,
      );
    });
  });

  describe('error handling', () => {
    it('should throw and log error when setHeating fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetStateSetHandler(1)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setTargetTemperature fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetTempSetHandler(25)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });
  });

  describe('temperature conversion edge cases', () => {
    it('should handle room temperature (20°C = 2932 Kelvin*10)', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '2932' } },
      });

      const result = currentTempGetHandler() as number;
      // 2932/10 - 273.15 = 20.05, rounded to 20.1
      expect(result).toBeCloseTo(20, 0);
    });

    it('should handle cold temperature (10°C = 2832 Kelvin*10)', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '2832' } },
      });

      const result = currentTempGetHandler() as number;
      expect(result).toBeCloseTo(10, 0);
    });

    it('should handle warm temperature (30°C = 3032 Kelvin*10)', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '3032' } },
      });

      const result = currentTempGetHandler() as number;
      expect(result).toBeCloseTo(30, 0);
    });
  });
});
