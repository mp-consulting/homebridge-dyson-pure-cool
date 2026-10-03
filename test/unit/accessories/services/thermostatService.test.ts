/**
 * ThermostatService Unit Tests
 */

import { vi, type Mock, type Mocked } from 'vitest';

import { ThermostatService } from '../../../../src/accessories/services/thermostatService.js';
import type { ThermostatServiceConfig } from '../../../../src/accessories/services/thermostatService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, PlatformAccessory, Service, Logging } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { setDeviceState } from '../../../helpers/device.js';

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
    ConfiguredName: { UUID: 'configured-name-uuid' },
  };

  const Service = {
    Thermostat: { UUID: 'thermostat-uuid' },
  };

  return createMockHapApi({ Service, Characteristic });
}

/** Set the value HomeKit holds for a characteristic (what GET falls back to) */
function setCachedValue(service: Mocked<Service>, characteristic: unknown, value: unknown): void {
  const char = service.getCharacteristic(characteristic as never) as unknown as { value: unknown };
  char.value = value;
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
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room Heater',
      getServiceById: vi.fn().mockReturnValue(undefined),
      addService: vi.fn().mockReturnValue(mockService),
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
    currentStateGetHandler = (currentStateChar!.onGet as Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHeatingCoolingState);
    targetStateGetHandler = (targetStateChar!.onGet as Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as Mock).mock.calls[0][0];

    const currentTempChar = mockService.getCharacteristic(Characteristic.CurrentTemperature);
    currentTempGetHandler = (currentTempChar!.onGet as Mock).mock.calls[0][0];

    const targetTempChar = mockService.getCharacteristic(Characteristic.TargetTemperature);
    targetTempGetHandler = (targetTempChar!.onGet as Mock).mock.calls[0][0];
    targetTempSetHandler = (targetTempChar!.onSet as Mock).mock.calls[0][0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create Thermostat service', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.Thermostat,
        'thermostat',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.Thermostat,
        'Thermostat',
        'thermostat',
      );
    });

    it('should reuse an existing service without touching its ConfiguredName', () => {
      const existingService = createMockService();
      const accessory = {
        displayName: 'Living Room Heater',
        getServiceById: vi.fn().mockReturnValue(existingService),
        addService: vi.fn(),
      } as unknown as PlatformAccessory;

      const svc = new ThermostatService({ accessory, device, api: mockApi, log: mockLog });

      expect(svc.getService()).toBe(existingService);
      expect(accessory.addService).not.toHaveBeenCalled();
      expect(existingService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(existingService.updateCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        expect.anything(),
      );
      svc.destroy();
    });

    it('should link to the primary service when given', () => {
      const primaryService = createMockService();
      const svc = new ThermostatService({
        accessory: mockAccessory,
        device,
        api: mockApi,
        log: mockLog,
        primaryService,
      });

      expect(primaryService.addLinkedService).toHaveBeenCalledWith(mockService);
      svc.destroy();
    });

    it('should set configured name', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Thermostat',
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
      await flushCommands();

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
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmod: 'OFF' },
        }),
      );
    });
  });

  describe('CurrentTemperature characteristic', () => {
    it('should return the cached HomeKit value when temperature is undefined', () => {
      setCachedValue(mockService, mockApi.hap.Characteristic.CurrentTemperature, 19.5);
      const result = currentTempGetHandler();
      expect(result).toBe(19.5);
    });

    it('should throw HapStatusError when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      expect(() => currentTempGetHandler()).toThrow(
        expect.objectContaining({ hapStatus: -70402 }) as unknown as Error,
      );
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

    it('should return the cached value for 0 temperature', async () => {
      setCachedValue(mockService, mockApi.hap.Characteristic.CurrentTemperature, 21);
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { tact: '0000' } },
      });

      const result = currentTempGetHandler();
      expect(result).toBe(21); // Cached
    });

    it('should return the cached value for negative temperature', async () => {
      // Negative values shouldn't happen but handle gracefully
      setCachedValue(mockService, mockApi.hap.Characteristic.CurrentTemperature, 21);
      setDeviceState(device, { temperature: -100 });
      const result = currentTempGetHandler();
      expect(result).toBe(21); // Cached
    });
  });

  describe('TargetTemperature characteristic', () => {
    it('should return the cached HomeKit value when target temperature is undefined', () => {
      setCachedValue(mockService, mockApi.hap.Characteristic.TargetTemperature, 23);
      const result = targetTempGetHandler();
      expect(result).toBe(23);
    });

    it('should not push temperatures to HomeKit while they are unknown', () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmod: 'HEAT' } },
      });

      const Characteristic = mockApi.hap.Characteristic;
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHeatingCoolingState,
        1,
      );
      expect(mockService.updateCharacteristic).not.toHaveBeenCalledWith(
        Characteristic.CurrentTemperature,
        expect.anything(),
      );
      expect(mockService.updateCharacteristic).not.toHaveBeenCalledWith(
        Characteristic.TargetTemperature,
        expect.anything(),
      );
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
      await flushCommands();

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
    it('should throw HapStatusError and log when setHeating MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetStateSetHandler(1)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set heating mode: MQTT error');
    });

    it('should throw HapStatusError and log when setTargetTemperature MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetTempSetHandler(25)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set target temperature: MQTT error');
    });

    it('should throw HapStatusError when the device is not connected', async () => {
      mockMqttClient.isConnected.mockReturnValue(false);

      await expect(targetStateSetHandler(1)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set heating mode: Device not connected');
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
