/**
 * HumidifierControlService Unit Tests
 */

import { vi, type Mock } from 'vitest';

import { HumidifierControlService } from '../../../../src/accessories/services/humidifierControlService.js';
import type { HumidifierControlServiceConfig } from '../../../../src/accessories/services/humidifierControlService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';
import { HapStatusError, createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { setDeviceState } from '../../../helpers/device.js';

// Create mock API with hap
function createMockApi() {
  const Characteristic = {
    Active: { UUID: 'active-uuid' },
    CurrentHumidifierDehumidifierState: {
      UUID: 'current-humidifier-dehumidifier-state-uuid',
      INACTIVE: 0,
      IDLE: 1,
      HUMIDIFYING: 2,
      DEHUMIDIFYING: 3,
    },
    TargetHumidifierDehumidifierState: {
      UUID: 'target-humidifier-dehumidifier-state-uuid',
      HUMIDIFIER_OR_DEHUMIDIFIER: 0,
      HUMIDIFIER: 1,
      DEHUMIDIFIER: 2,
    },
    CurrentRelativeHumidity: { UUID: 'current-relative-humidity-uuid' },
    RelativeHumidityHumidifierThreshold: { UUID: 'relative-humidity-humidifier-threshold-uuid' },
    WaterLevel: { UUID: 'water-level-uuid' },
    Name: { UUID: 'name-uuid' },
    ConfiguredName: { UUID: 'configured-name-uuid' },
  };

  const Service = {
    HumidifierDehumidifier: { UUID: 'humidifier-dehumidifier-uuid' },
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

describe('HumidifierControlService', () => {
  let humidifierService: HumidifierControlService;
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
  let currentHumidityGetHandler: () => unknown;
  let targetHumidityGetHandler: () => unknown;
  let targetHumiditySetHandler: (value: unknown) => Promise<void>;
  let waterLevelGetHandler: () => unknown;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'PH01-AB-12345678',
    productType: '358',
    name: 'Living Room Humidifier',
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
      displayName: 'Living Room Humidifier',
      getServiceById: vi.fn().mockReturnValue(undefined),
      addService: vi.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: HumidifierControlServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    humidifierService = new HumidifierControlService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const activeChar = mockService.getCharacteristic(Characteristic.Active);
    activeGetHandler = (activeChar!.onGet as Mock).mock.calls[0][0];
    activeSetHandler = (activeChar!.onSet as Mock).mock.calls[0][0];

    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState);
    currentStateGetHandler = (currentStateChar!.onGet as Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState);
    targetStateGetHandler = (targetStateChar!.onGet as Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as Mock).mock.calls[0][0];

    const currentHumidityChar = mockService.getCharacteristic(Characteristic.CurrentRelativeHumidity);
    currentHumidityGetHandler = (currentHumidityChar!.onGet as Mock).mock.calls[0][0];

    const targetHumidityChar = mockService.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold);
    targetHumidityGetHandler = (targetHumidityChar!.onGet as Mock).mock.calls[0][0];
    targetHumiditySetHandler = (targetHumidityChar!.onSet as Mock).mock.calls[0][0];

    const waterLevelChar = mockService.getCharacteristic(Characteristic.WaterLevel);
    waterLevelGetHandler = (waterLevelChar!.onGet as Mock).mock.calls[0][0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create HumidifierDehumidifier service', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.HumidifierDehumidifier, 'humidifier',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.HumidifierDehumidifier, 'Humidifier', 'humidifier',
      );
    });

    it('should not overwrite ConfiguredName of an existing service', () => {
      const existingService = createMockService();
      const existingAccessory = {
        displayName: 'Existing',
        getServiceById: vi.fn().mockReturnValue(existingService),
        addService: vi.fn(),
      } as unknown as PlatformAccessory;

      new HumidifierControlService({ accessory: existingAccessory, device, api: mockApi, log: mockLog });

      expect(existingAccessory.addService).not.toHaveBeenCalled();
      expect(existingService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(existingService.updateCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        expect.anything(),
      );
    });

    it('should set configured name', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Humidifier',
      );
    });

    it('should register Active characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.Active);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should register CurrentHumidifierDehumidifierState characteristic handler', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.CurrentHumidifierDehumidifierState);
      expect(char!.onGet).toHaveBeenCalled();
    });

    it('should register TargetHumidifierDehumidifierState characteristic handlers with valid values', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.TargetHumidifierDehumidifierState);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
      expect(char!.setProps).toHaveBeenCalledWith({
        validValues: [0, 1], // HUMIDIFIER_OR_DEHUMIDIFIER and HUMIDIFIER
      });
    });

    it('should register RelativeHumidityHumidifierThreshold characteristic handlers with default range', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.RelativeHumidityHumidifierThreshold);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
      expect(char!.setProps).toHaveBeenCalledWith({
        minValue: 30,
        maxValue: 70,
        minStep: 1,
      });
    });

    it('should register WaterLevel characteristic handler', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.WaterLevel);
      expect(char!.onGet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(humidifierService.getService()).toBe(mockService);
    });
  });

  describe('initialization with full humidity range', () => {
    it('should use full humidity range when configured', async () => {
      // Create new service with full range
      const fullRangeService = createMockService();
      const fullRangeAccessory = {
        displayName: 'Full Range Humidifier',
        getServiceById: vi.fn().mockReturnValue(fullRangeService),
        addService: vi.fn().mockReturnValue(fullRangeService),
      } as unknown as PlatformAccessory;

      const config: HumidifierControlServiceConfig = {
        accessory: fullRangeAccessory,
        device,
        api: mockApi,
        log: mockLog,
        fullRangeHumidity: true,
      };

      new HumidifierControlService(config);

      const char = fullRangeService.getCharacteristic(mockApi.hap.Characteristic.RelativeHumidityHumidifierThreshold);
      expect(char!.setProps).toHaveBeenCalledWith({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });
    });
  });

  describe('Active characteristic', () => {
    it('should return 0 when humidifier is off', () => {
      const result = activeGetHandler();
      expect(result).toBe(0);
    });

    it('should throw HapStatusError when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      expect(() => activeGetHandler()).toThrow(HapStatusError);
    });

    it('should return 1 when humidifier is on', async () => {
      // Simulate state change from device
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'ON' } },
      });

      const result = activeGetHandler();
      expect(result).toBe(1);
    });

    it('should call setHumidifier(true) when set to 1', async () => {
      await activeSetHandler(1);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { hume: 'ON' },
        }),
      );
    });

    it('should call setHumidifier(false) when set to 0', async () => {
      await activeSetHandler(0);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hume: 'OFF' },
        }),
      );
    });
  });

  describe('CurrentHumidifierDehumidifierState characteristic', () => {
    it('should return INACTIVE (0) when humidifier is off', () => {
      const result = currentStateGetHandler();
      expect(result).toBe(0);
    });

    it('should return HUMIDIFYING (2) when humidifier is on and current < target', async () => {
      // Simulate humidifier on with current humidity below target
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'ON', hact: '0040', humt: '0050' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(2); // HUMIDIFYING
    });

    it('should return IDLE (1) when humidifier is on and current >= target', async () => {
      // Simulate humidifier on with current humidity at or above target
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'ON', hact: '0060', humt: '0050' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(1); // IDLE
    });

    it('should return IDLE (1) when humidifier is on but humidity is unknown', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'ON', humt: '0050' } },
      });

      expect(currentStateGetHandler()).toBe(1);
    });
  });

  describe('TargetHumidifierDehumidifierState characteristic', () => {
    it('should return HUMIDIFIER (1) when not in auto mode', () => {
      const result = targetStateGetHandler();
      expect(result).toBe(1);
    });

    it('should return HUMIDIFIER_OR_DEHUMIDIFIER (0) when humidifierAuto is set', () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'AUTO' } },
      });
      expect(targetStateGetHandler()).toBe(0);

      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'ON' } },
      });
      expect(targetStateGetHandler()).toBe(1);
    });

    it('should push TargetHumidifierDehumidifierState on state change', () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'AUTO' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.TargetHumidifierDehumidifierState,
        0,
      );
    });

    it('should call setHumidifierAuto() when set to HUMIDIFIER_OR_DEHUMIDIFIER (0)', async () => {
      await targetStateSetHandler(0);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hume: 'AUTO' },
        }),
      );
    });

    it('should call setHumidifier(true) when set to HUMIDIFIER (1)', async () => {
      const setHumidifier = vi.spyOn(device, 'setHumidifier');
      mockMqttClient.publishCommand.mockClear();
      await targetStateSetHandler(1);
      await flushCommands();

      expect(setHumidifier).toHaveBeenCalledWith(true);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hume: 'ON' },
        }),
      );
    });
  });

  describe('CurrentRelativeHumidity characteristic', () => {
    it('should return the cached HomeKit value when humidity is undefined', () => {
      mockService.getCharacteristic(mockApi.hap.Characteristic.CurrentRelativeHumidity)!.value = 37;
      const result = currentHumidityGetHandler();
      expect(result).toBe(37);
    });

    it('should return current humidity value', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hact: '0045' } },
      });

      const result = currentHumidityGetHandler();
      expect(result).toBe(45);
    });
  });

  describe('RelativeHumidityHumidifierThreshold characteristic', () => {
    it('should return the cached HomeKit value when target humidity is undefined', () => {
      mockService.getCharacteristic(mockApi.hap.Characteristic.RelativeHumidityHumidifierThreshold)!.value = 45;
      const result = targetHumidityGetHandler();
      expect(result).toBe(45);
    });

    it('should return target humidity value', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { humt: '0060' } },
      });

      const result = targetHumidityGetHandler();
      expect(result).toBe(60);
    });

    it('should clamp target humidity to min range', async () => {
      // Simulate target humidity below min (30 for default)
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { humt: '0010' } },
      });

      const result = targetHumidityGetHandler();
      expect(result).toBe(30); // Clamped to min
    });

    it('should clamp target humidity to max range', async () => {
      // Simulate target humidity above max (70 for default)
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { humt: '0090' } },
      });

      const result = targetHumidityGetHandler();
      expect(result).toBe(70); // Clamped to max
    });

    it('should call setTargetHumidity when set', async () => {
      await targetHumiditySetHandler(55);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { humt: '0055' },
        }),
      );
    });
  });

  describe('WaterLevel characteristic', () => {
    it('should return 100 when water tank is not empty', () => {
      const result = waterLevelGetHandler();
      expect(result).toBe(100);
    });

    it('should return 0 when water tank is empty', async () => {
      // Set water tank empty state directly on device state
      setDeviceState(device, { waterTankEmpty: true });

      const result = waterLevelGetHandler();
      expect(result).toBe(0);
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
            hume: 'ON',
            hact: '0040',
            humt: '0060',
            wath: 'OK',
          },
        },
      });

      const Characteristic = mockApi.hap.Characteristic;

      // Characteristics should be updated
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.Active,
        1,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHumidifierDehumidifierState,
        2, // HUMIDIFYING because current < target
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentRelativeHumidity,
        40,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.RelativeHumidityHumidifierThreshold,
        60,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.WaterLevel,
        100,
      );
    });

    it('should update characteristics when humidifier turns off', async () => {
      // First turn on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'ON' } },
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { hume: 'OFF' } },
      });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.Active,
        0,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHumidifierDehumidifierState,
        0, // INACTIVE
      );
    });

    it('should show water tank empty status', async () => {
      // Update device state with water tank empty
      setDeviceState(device, { waterTankEmpty: true }, { emit: true });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.WaterLevel,
        0,
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
            hume: 'ON',
            hact: '0055',
            humt: '0050',
            wath: 'OK',
          },
        },
      });

      mockService.updateCharacteristic.mockClear();

      humidifierService.updateFromState();

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.Active,
        1,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentHumidifierDehumidifierState,
        1, // IDLE because current >= target
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.CurrentRelativeHumidity,
        55,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.RelativeHumidityHumidifierThreshold,
        50,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.WaterLevel,
        100,
      );
    });
  });

  describe('error handling', () => {
    it('should throw HapStatusError when setHumidifier MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));
      await expect(activeSetHandler(1)).rejects.toBeInstanceOf(HapStatusError);
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set humidifier: MQTT error');
    });

    it('should throw HapStatusError when setTargetHumidity MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));
      await expect(targetHumiditySetHandler(50)).rejects.toBeInstanceOf(HapStatusError);
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set target humidity: MQTT error');
    });

    it('should throw HapStatusError when setHumidifierAuto MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));
      await expect(targetStateSetHandler(0)).rejects.toBeInstanceOf(HapStatusError);
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set humidifier auto: MQTT error');
    });
  });
});
