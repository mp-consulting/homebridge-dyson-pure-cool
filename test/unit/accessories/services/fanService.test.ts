/**
 * FanService Unit Tests (AirPurifier Service)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { FanService } from '../../../../src/accessories/services/fanService.js';
import type { FanServiceConfig } from '../../../../src/accessories/services/fanService.js';
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
    CurrentAirPurifierState: { UUID: 'current-air-purifier-state-uuid' },
    TargetAirPurifierState: { UUID: 'target-air-purifier-state-uuid' },
    RotationSpeed: { UUID: 'rotation-speed-uuid' },
    SwingMode: { UUID: 'swing-mode-uuid' },
    Name: { UUID: 'name-uuid' },
  };

  const Service = {
    AirPurifier: { UUID: 'air-purifier-uuid' },
  };

  return {
    hap: {
      Service,
      Characteristic,
    },
  } as unknown as API;
}

describe('FanService', () => {
  let fanService: FanService;
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
  let speedGetHandler: () => unknown;
  let speedSetHandler: (value: unknown) => Promise<void>;
  let swingModeGetHandler: () => unknown;
  let swingModeSetHandler: (value: unknown) => Promise<void>;

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
      getService: jest.fn().mockReturnValue(mockService),
      addService: jest.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: FanServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    fanService = new FanService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const activeChar = mockService.getCharacteristic(Characteristic.Active);
    activeGetHandler = (activeChar!.onGet as jest.Mock).mock.calls[0][0];
    activeSetHandler = (activeChar!.onSet as jest.Mock).mock.calls[0][0];

    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentAirPurifierState);
    currentStateGetHandler = (currentStateChar!.onGet as jest.Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetAirPurifierState);
    targetStateGetHandler = (targetStateChar!.onGet as jest.Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as jest.Mock).mock.calls[0][0];

    const speedChar = mockService.getCharacteristic(Characteristic.RotationSpeed);
    speedGetHandler = (speedChar!.onGet as jest.Mock).mock.calls[0][0];
    speedSetHandler = (speedChar!.onSet as jest.Mock).mock.calls[0][0];

    const swingChar = mockService.getCharacteristic(Characteristic.SwingMode);
    swingModeGetHandler = (swingChar!.onGet as jest.Mock).mock.calls[0][0];
    swingModeSetHandler = (swingChar!.onSet as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create AirPurifier service', () => {
      expect(mockAccessory.getService).toHaveBeenCalled();
    });

    it('should set display name', () => {
      expect(mockService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Name,
        'Living Room',
      );
    });

    it('should register Active characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.Active);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should register CurrentAirPurifierState characteristic handler', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.CurrentAirPurifierState);
      expect(char!.onGet).toHaveBeenCalled();
    });

    it('should register TargetAirPurifierState characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.TargetAirPurifierState);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should register RotationSpeed characteristic handlers with props', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.RotationSpeed);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
      expect(char!.setProps).toHaveBeenCalledWith({
        minValue: 0,
        maxValue: 100,
        minStep: 10,
      });
    });

    it('should register SwingMode characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.SwingMode);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(fanService.getService()).toBe(mockService);
    });
  });

  describe('Active characteristic', () => {
    it('should return 0 when fan is off', () => {
      const result = activeGetHandler();
      expect(result).toBe(0);
    });

    it('should return 1 when fan is on', async () => {
      // Simulate state change from device
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON' } },
      });

      const result = activeGetHandler();
      expect(result).toBe(1);
    });

    it('should call setFanPower(true) when set to 1', async () => {
      await activeSetHandler(1);

      // setFanPower uses fmod command - AUTO when autoMode is set, FAN otherwise
      // Also sends auto field for compatibility with all Dyson models
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { auto: 'OFF', fmod: 'FAN' },
        }),
      );
    });

    it('should call setFanPower(false) when set to 0', async () => {
      await activeSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'OFF' },
        }),
      );
    });
  });

  describe('CurrentAirPurifierState characteristic', () => {
    it('should return 0 (INACTIVE) when fan is off', () => {
      const result = currentStateGetHandler();
      expect(result).toBe(0);
    });

    it('should return 2 (PURIFYING_AIR) when fan is on with manual speed', async () => {
      // Simulate state change from device - fan on with manual speed
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', fnsp: '0005', fmod: 'FAN' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(2);
    });

    it('should return 1 (IDLE) when fan is on in auto mode', async () => {
      // Simulate state change from device - fan on in auto mode
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', fmod: 'AUTO' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(1);
    });
  });

  describe('TargetAirPurifierState characteristic', () => {
    it('should return 0 (MANUAL) when auto mode is off', () => {
      const result = targetStateGetHandler();
      expect(result).toBe(0);
    });

    it('should return 1 (AUTO) when auto mode is on', async () => {
      // Simulate auto mode on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fmod: 'AUTO' } },
      });

      const result = targetStateGetHandler();
      expect(result).toBe(1);
    });

    it('should call setAutoMode(true) when set to 1 (AUTO)', async () => {
      await targetStateSetHandler(1);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fpwr: 'ON', auto: 'ON', fmod: 'AUTO' },
        }),
      );
    });

    it('should call setAutoMode(false) when set to 0 (MANUAL)', async () => {
      await targetStateSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ auto: 'OFF', fmod: 'FAN' }),
        }),
      );
    });
  });

  describe('RotationSpeed characteristic', () => {
    it('should return 0 when fan speed is 0', () => {
      const result = speedGetHandler();
      expect(result).toBe(0);
    });

    it('should return percentage based on fan speed', async () => {
      // Simulate state change with speed 5
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fnsp: '0005' } },
      });

      const result = speedGetHandler();
      expect(result).toBe(50);
    });

    it('should return 100 for AUTO mode', async () => {
      // Simulate auto mode
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fnsp: 'AUTO' } },
      });

      const result = speedGetHandler();
      expect(result).toBe(100);
    });

    it('should call setFanPower(false) when set to 0', async () => {
      await speedSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'OFF' },
        }),
      );
    });

    it('should call setFanSpeed with converted value', async () => {
      await speedSetHandler(50);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fnsp: '0005' }),
        }),
      );
    });

    it('should turn fan on if off when setting speed', async () => {
      // Fan is off by default
      await speedSetHandler(50);

      // Should have both speed and power commands
      const calls = mockMqttClient.publishCommand.mock.calls;
      const dataValues = calls.map((call) => (call[0] as { data: Record<string, string> }).data);

      // Check that we have a speed command
      expect(dataValues.some((d) => d.fnsp === '0005')).toBe(true);
    });
  });

  describe('SwingMode characteristic', () => {
    it('should return 0 when oscillation is off', () => {
      const result = swingModeGetHandler();
      expect(result).toBe(0);
    });

    it('should return 1 when oscillation is on', async () => {
      // Simulate oscillation on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { oson: 'ON' } },
      });

      const result = swingModeGetHandler();
      expect(result).toBe(1);
    });

    it('should call setOscillation(true) when set to 1', async () => {
      await swingModeSetHandler(1);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { oson: 'ON' },
        }),
      );
    });

    it('should call setOscillation(false) when set to 0', async () => {
      await swingModeSetHandler(0);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { oson: 'OFF' },
        }),
      );
    });
  });

  describe('state change handling', () => {
    it('should update characteristics when device state changes', async () => {
      // Simulate full state update
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fpwr: 'ON',
            fnsp: '0007',
            oson: 'ON',
            fmod: 'AUTO',
          },
        },
      });

      // Characteristics should be updated
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Active,
        1,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.CurrentAirPurifierState,
        1, // IDLE because auto mode
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.TargetAirPurifierState,
        1, // AUTO
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.RotationSpeed,
        70,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.SwingMode,
        1,
      );
    });

    it('should update characteristics when fan turns off', async () => {
      // First turn on
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON' } },
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'OFF' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Active,
        0,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.CurrentAirPurifierState,
        0, // INACTIVE
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
            fpwr: 'ON',
            fnsp: '0003',
            oson: 'OFF',
            fmod: 'FAN',
          },
        },
      });

      mockService.updateCharacteristic.mockClear();

      fanService.updateFromState();

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Active,
        1,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.CurrentAirPurifierState,
        2, // PURIFYING_AIR
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.TargetAirPurifierState,
        0, // MANUAL
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.RotationSpeed,
        30,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.SwingMode,
        0,
      );
    });
  });

  describe('error handling', () => {
    it('should throw and log error when setFanPower fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(activeSetHandler(1)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setFanSpeed fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(speedSetHandler(50)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setOscillation fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(swingModeSetHandler(1)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });

    it('should throw and log error when setAutoMode fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetStateSetHandler(1)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
