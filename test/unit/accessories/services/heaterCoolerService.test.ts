/**
 * HeaterCoolerService Unit Tests
 */

import { vi, type Mock } from 'vitest';

import { HeaterCoolerService } from '../../../../src/accessories/services/heaterCoolerService.js';
import type { HeaterCoolerServiceConfig } from '../../../../src/accessories/services/heaterCoolerService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';

// Create mock API with hap
function createMockApi() {
  const Characteristic = {
    Active: { UUID: 'active-uuid' },
    CurrentHeaterCoolerState: { UUID: 'current-state-uuid' },
    TargetHeaterCoolerState: { UUID: 'target-state-uuid' },
    CurrentTemperature: { UUID: 'current-temp-uuid' },
    HeatingThresholdTemperature: { UUID: 'heating-threshold-uuid' },
    Name: { UUID: 'name-uuid' },
    ConfiguredName: { UUID: 'configured-name-uuid' },
  };

  const Service = {
    HeaterCooler: { UUID: 'heater-cooler-uuid' },
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
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room',
      getServiceById: vi.fn().mockReturnValue(undefined),
      addService: vi.fn().mockReturnValue(mockService),
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
    activeGetHandler = (activeChar!.onGet as Mock).mock.calls[0][0];
    activeSetHandler = (activeChar!.onSet as Mock).mock.calls[0][0];

    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentHeaterCoolerState);
    currentStateGetHandler = (currentStateChar!.onGet as Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHeaterCoolerState);
    targetStateGetHandler = (targetStateChar!.onGet as Mock).mock.calls[0][0];

    const currentTempChar = mockService.getCharacteristic(Characteristic.CurrentTemperature);
    currentTempGetHandler = (currentTempChar!.onGet as Mock).mock.calls[0][0];

    const heatingThresholdChar = mockService.getCharacteristic(Characteristic.HeatingThresholdTemperature);
    heatingThresholdGetHandler = (heatingThresholdChar!.onGet as Mock).mock.calls[0][0];
    heatingThresholdSetHandler = (heatingThresholdChar!.onSet as Mock).mock.calls[0][0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create HeaterCooler service', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.HeaterCooler,
        'heater-cooler',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.HeaterCooler,
        'Heater',
        'heater-cooler',
      );
    });

    it('should not touch ConfiguredName of an existing service', () => {
      const existingService = createMockService();
      const accessory = {
        displayName: 'Living Room',
        getServiceById: vi.fn().mockReturnValue(existingService),
        addService: vi.fn(),
      } as unknown as PlatformAccessory;

      const svc = new HeaterCoolerService({ accessory, device, api: mockApi, log: mockLog });

      expect(svc.getService()).toBe(existingService);
      expect(accessory.addService).not.toHaveBeenCalled();
      expect(existingService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(existingService.updateCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        expect.anything(),
      );
      svc.destroy();
    });

    it('should set configured name', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Heater',
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
      // No onSet - on/off is controlled via Active characteristic
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

    it('should enable heating only when set to 1 while the fan is already on', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fmod: 'FAN', hmod: 'OFF' } },
      });
      expect(device.getState().isOn).toBe(true);

      await activeSetHandler(1);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hmod: 'HEAT' },
        }),
      );
    });

    it('should send heating and fan power in ONE MQTT publish when set to 1 while off', async () => {
      expect(device.getState().isOn).toBe(false);

      await activeSetHandler(1);
      await flushCommands();

      // HP02 (455) uses the legacy fmod power protocol
      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hmod: 'HEAT', fmod: 'FAN' }),
        }),
      );
    });

    it('should throw HapStatusError when the device is disconnected on GET', async () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      expect(() => activeGetHandler()).toThrow(
        expect.objectContaining({ hapStatus: -70402 }) as unknown as Error,
      );
    });

    it('should disable heating when set to 0', async () => {
      await activeSetHandler(0);
      await flushCommands();

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

    it('should return HEATING (2) when on and heating with unknown temperatures', () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fmod: 'FAN', hmod: 'HEAT' } },
      });

      expect(currentStateGetHandler()).toBe(2); // HEATING
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
    it('should always return HEAT (1) since that is the only supported mode', () => {
      // TargetHeaterCoolerState is always HEAT
      // On/off is controlled via the Active characteristic
      const result = targetStateGetHandler();
      expect(result).toBe(1); // HEAT
    });

    it('should return HEAT (1) even when heating is disabled', async () => {
      // Heating disabled via device state
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmod: 'OFF' } },
      });

      // TargetHeaterCoolerState still returns HEAT (on/off is via Active)
      const result = targetStateGetHandler();
      expect(result).toBe(1); // HEAT
    });
  });

  describe('CurrentTemperature characteristic', () => {
    it('should return the cached HomeKit value when there is no reading', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.CurrentTemperature);
      (char as unknown as { value: unknown }).value = 18.5;

      expect(currentTempGetHandler()).toBe(18.5);
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
    it('should return the cached HomeKit value (initially 20°C) when not set', () => {
      const result = heatingThresholdGetHandler();
      expect(result).toBe(20);
    });

    it('should clamp a device target below 10°C to 10°C', () => {
      // 2782 K*10 = 278.2 K ≈ 5°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmax: '2782' } },
      });

      expect(heatingThresholdGetHandler()).toBe(10);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.HeatingThresholdTemperature,
        10,
      );
    });

    it('should clamp a device target above 38°C to 38°C', () => {
      // 3132 K*10 = 313.2 K ≈ 40°C
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hmax: '3132' } },
      });

      expect(heatingThresholdGetHandler()).toBe(38);
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
      await flushCommands();

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
    it('should throw HapStatusError and log when the Active SET publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(activeSetHandler(1)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set heater active: MQTT error');
    });

    it('should throw HapStatusError and log when setTargetTemperature publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(heatingThresholdSetHandler(22)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set target temperature: MQTT error');
    });

    it('should throw HapStatusError when the device is not connected', async () => {
      mockMqttClient.isConnected.mockReturnValue(false);

      await expect(heatingThresholdSetHandler(22)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set target temperature: Device not connected');
    });
  });
});
