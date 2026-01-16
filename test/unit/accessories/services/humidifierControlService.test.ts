/**
 * HumidifierControlService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { HumidifierControlService } from '../../../../src/accessories/services/humidifierControlService.js';
import type { HumidifierControlServiceConfig } from '../../../../src/accessories/services/humidifierControlService.js';
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
    addOptionalCharacteristic: jest.fn().mockReturnThis(),
    addLinkedService: jest.fn().mockReturnThis(),
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

  return {
    hap: {
      Service,
      Characteristic,
    },
  } as unknown as API;
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
    mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room Humidifier',
      getService: jest.fn().mockReturnValue(mockService),
      addService: jest.fn().mockReturnValue(mockService),
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
    activeGetHandler = (activeChar!.onGet as jest.Mock).mock.calls[0][0];
    activeSetHandler = (activeChar!.onSet as jest.Mock).mock.calls[0][0];

    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState);
    currentStateGetHandler = (currentStateChar!.onGet as jest.Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState);
    targetStateGetHandler = (targetStateChar!.onGet as jest.Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as jest.Mock).mock.calls[0][0];

    const currentHumidityChar = mockService.getCharacteristic(Characteristic.CurrentRelativeHumidity);
    currentHumidityGetHandler = (currentHumidityChar!.onGet as jest.Mock).mock.calls[0][0];

    const targetHumidityChar = mockService.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold);
    targetHumidityGetHandler = (targetHumidityChar!.onGet as jest.Mock).mock.calls[0][0];
    targetHumiditySetHandler = (targetHumidityChar!.onSet as jest.Mock).mock.calls[0][0];

    const waterLevelChar = mockService.getCharacteristic(Characteristic.WaterLevel);
    waterLevelGetHandler = (waterLevelChar!.onGet as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create HumidifierDehumidifier service', () => {
      expect(mockAccessory.getService).toHaveBeenCalled();
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
        getService: jest.fn().mockReturnValue(fullRangeService),
        addService: jest.fn().mockReturnValue(fullRangeService),
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
  });

  describe('TargetHumidifierDehumidifierState characteristic', () => {
    it('should always return HUMIDIFIER (1)', () => {
      const result = targetStateGetHandler();
      expect(result).toBe(1);
    });

    it('should call setHumidifierAuto() when set to HUMIDIFIER_OR_DEHUMIDIFIER (0)', async () => {
      await targetStateSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hume: 'AUTO' },
        }),
      );
    });

    it('should not send command when set to HUMIDIFIER (1)', async () => {
      mockMqttClient.publishCommand.mockClear();
      await targetStateSetHandler(1);

      // No command should be sent for manual mode
      expect(mockMqttClient.publishCommand).not.toHaveBeenCalled();
    });
  });

  describe('CurrentRelativeHumidity characteristic', () => {
    it('should return 50 as default when humidity is undefined', () => {
      const result = currentHumidityGetHandler();
      expect(result).toBe(50);
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
    it('should return 50 as default when target humidity is undefined', () => {
      const result = targetHumidityGetHandler();
      expect(result).toBe(50);
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
      device.state.waterTankEmpty = true;

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
      device.updateState({
        waterTankEmpty: true,
      });

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
    it('should throw and log error when setHumidifier fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(activeSetHandler(1)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setTargetHumidity fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetHumiditySetHandler(50)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setHumidifierAuto fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetStateSetHandler(0)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
