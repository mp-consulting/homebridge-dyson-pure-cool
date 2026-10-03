/**
 * FanService Unit Tests (AirPurifier Service)
 */

import { vi, type Mock } from 'vitest';

import { FanService } from '../../../../src/accessories/services/fanService.js';
import type { FanServiceConfig } from '../../../../src/accessories/services/fanService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';

// Create mock API with hap
function createMockApi() {
  const Characteristic = {
    Active: { UUID: 'active-uuid' },
    CurrentAirPurifierState: { UUID: 'current-air-purifier-state-uuid' },
    TargetAirPurifierState: { UUID: 'target-air-purifier-state-uuid' },
    RotationSpeed: { UUID: 'rotation-speed-uuid' },
    SwingMode: { UUID: 'swing-mode-uuid' },
    Name: { UUID: 'name-uuid' },
    ConfiguredName: { UUID: 'configured-name-uuid' },
  };

  const Service = {
    AirPurifier: { UUID: 'air-purifier-uuid' },
  };

  return createMockHapApi({ Service, Characteristic });
}

/**
 * Flush microtask command queue.
 * Commands are batched via queueMicrotask in DysonLinkDevice.
 * Multiple await rounds are needed to process the full chain:
 * queueMicrotask → flushCommand → sendCommand → publishCommand
 */
async function flushCommands(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
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
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room',
      getService: vi.fn().mockReturnValue(mockService),
      addService: vi.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: FanServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
      deviceName: 'Living Room',
    };

    fanService = new FanService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const activeChar = mockService.getCharacteristic(Characteristic.Active);
    activeGetHandler = (activeChar!.onGet as Mock).mock.calls[0][0];
    activeSetHandler = (activeChar!.onSet as Mock).mock.calls[0][0];

    const currentStateChar = mockService.getCharacteristic(Characteristic.CurrentAirPurifierState);
    currentStateGetHandler = (currentStateChar!.onGet as Mock).mock.calls[0][0];

    const targetStateChar = mockService.getCharacteristic(Characteristic.TargetAirPurifierState);
    targetStateGetHandler = (targetStateChar!.onGet as Mock).mock.calls[0][0];
    targetStateSetHandler = (targetStateChar!.onSet as Mock).mock.calls[0][0];

    const speedChar = mockService.getCharacteristic(Characteristic.RotationSpeed);
    speedGetHandler = (speedChar!.onGet as Mock).mock.calls[0][0];
    speedSetHandler = (speedChar!.onSet as Mock).mock.calls[0][0];

    const swingChar = mockService.getCharacteristic(Characteristic.SwingMode);
    swingModeGetHandler = (swingChar!.onGet as Mock).mock.calls[0][0];
    swingModeSetHandler = (swingChar!.onSet as Mock).mock.calls[0][0];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create AirPurifier service', () => {
      expect(mockAccessory.getService).toHaveBeenCalled();
    });

    it('should set configured name when creating a new service', () => {
      const newService = createMockService();
      const newAccessory = {
        displayName: 'Bedroom',
        getService: vi.fn().mockReturnValue(undefined),
        addService: vi.fn().mockReturnValue(newService),
      } as unknown as PlatformAccessory;

      new FanService({ accessory: newAccessory, device, api: mockApi, log: mockLog, deviceName: 'Bedroom' });

      expect(newAccessory.addService).toHaveBeenCalledWith(mockApi.hap.Service.AirPurifier, 'Bedroom', 'air-purifier');
      expect(newService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(newService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Bedroom',
      );
    });

    it('should not overwrite ConfiguredName of an existing service', () => {
      // beforeEach's accessory returns an existing service from getService
      expect(mockAccessory.addService).not.toHaveBeenCalled();
      expect(mockService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(mockService.updateCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        expect.anything(),
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
      await flushCommands();

      // setFanPower uses fmod command - FAN mode for manual, AUTO for auto mode
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { fmod: 'FAN' },
        }),
      );
    });

    it('should call setFanPower(false) when set to 0', async () => {
      await activeSetHandler(0);
      await flushCommands();

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

    it('should return 2 (PURIFYING_AIR) when fan is on in auto mode', async () => {
      // Simulate state change from device - fan on in auto mode with speed > 0
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', fmod: 'AUTO', fnsp: '0004' } },
      });

      const result = currentStateGetHandler();
      expect(result).toBe(2); // PURIFYING_AIR - device is on and actively purifying
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
      await flushCommands();

      // Newer models use fmod only, no fpwr/auto fields
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'AUTO' },
        }),
      );
    });

    it('should call setAutoMode(false) when set to 0 (MANUAL)', async () => {
      await targetStateSetHandler(0);
      await flushCommands();

      // Newer models use fmod and fnsp for manual mode
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fmod: 'FAN', fnsp: '0004' }),
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

    it('should return the default speed (40%) in AUTO mode before any manual speed is seen', async () => {
      // Simulate auto mode where fnsp is 'AUTO' (actual speed unknown)
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fnsp: 'AUTO' } },
      });

      // fanSpeed is -1: show FAN_SPEED.DEFAULT (4) rather than 0%
      expect(speedGetHandler()).toBe(40);
    });

    it('should keep showing the last manual speed in AUTO mode (not 0)', async () => {
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', fmod: 'FAN', fnsp: '0007' } },
      });
      expect(speedGetHandler()).toBe(70);

      mockService.updateCharacteristic.mockClear();
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fmod: 'AUTO', fnsp: 'AUTO' } },
      });

      expect(speedGetHandler()).toBe(70);
      expect(mockService.updateCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.RotationSpeed,
        0,
      );
    });

    it('should throw HapStatusError on GET when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);

      expect(() => speedGetHandler()).toThrow(mockApi.hap.HapStatusError);
      try {
        speedGetHandler();
      } catch (error) {
        expect((error as { hapStatus: number }).hapStatus).toBe(-70402);
      }
      expect(() => activeGetHandler()).toThrow(mockApi.hap.HapStatusError);
    });

    it('should call setFanPower(false) when set to 0', async () => {
      vi.useFakeTimers();
      speedSetHandler(0);
      // Fast-forward debounce timer
      vi.advanceTimersByTime(300);
      // Flush microtask command queue (Promise.resolve works with fake timers)
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'OFF' },
        }),
      );
    });

    it('should call setFanSpeed with converted value', async () => {
      vi.useFakeTimers();
      speedSetHandler(50);
      // Fast-forward debounce timer
      vi.advanceTimersByTime(300);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fnsp: '0005' }),
        }),
      );
    });

    it('should turn fan on if off when setting speed', async () => {
      vi.useFakeTimers();
      // Fan is off by default
      speedSetHandler(50);
      // Fast-forward debounce timer
      vi.advanceTimersByTime(300);
      await flushCommands();

      // Should have both speed and power commands
      const calls = mockMqttClient.publishCommand.mock.calls;
      const dataValues = calls.map((call) => (call[0] as { data: Record<string, string> }).data);

      // Check that we have a speed command
      expect(dataValues.some((d) => d.fnsp === '0005')).toBe(true);
    });

    it('should send power-on and speed in a single command with the speed winning when off', async () => {
      // Power-on would re-apply auto mode; the explicit speed must override it
      device.setActivationDefaults({ autoMode: true });
      vi.useFakeTimers();

      const result = speedSetHandler(70);
      vi.advanceTimersByTime(300);
      await flushCommands();
      await expect(result).resolves.toBeUndefined();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'FAN', fnsp: '0007' },
        }),
      );
    });

    it('should debounce rapid slider changes into one command and resolve all SETs', async () => {
      vi.useFakeTimers();

      const first = speedSetHandler(30);
      vi.advanceTimersByTime(100);
      const second = speedSetHandler(60);
      vi.advanceTimersByTime(300);
      await flushCommands();

      await expect(Promise.all([first, second])).resolves.toBeDefined();
      expect(mockMqttClient.publishCommand).toHaveBeenCalledTimes(1);
      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fmod: 'FAN', fnsp: '0006' },
        }),
      );
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
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { oson: 'ON' },
        }),
      );
    });

    it('should call setOscillation(false) when set to 0', async () => {
      await swingModeSetHandler(0);
      await flushCommands();

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
        2, // PURIFYING_AIR - device is on and running
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

  describe('change-only updates', () => {
    it('should not call updateCharacteristic again for an unchanged value', () => {
      const state = { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON', fmod: 'FAN', fnsp: '0005' } };
      mockMqttClient._emit('message', { topic: 'status', payload: Buffer.from('{}'), data: state });
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.Active, 1);

      mockService.updateCharacteristic.mockClear();
      // Only oscillation changes; everything else is unchanged
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { oson: 'ON' } },
      });

      expect(mockService.updateCharacteristic).toHaveBeenCalledTimes(1);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.SwingMode, 1);
    });
  });

  describe('error handling', () => {
    it('should throw HapStatusError and log when setFanPower(false) MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(activeSetHandler(0)).rejects.toBeInstanceOf(mockApi.hap.HapStatusError);
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set fan power: MQTT error');
    });

    it('should reject the RotationSpeed SET promise with HapStatusError when publish fails', async () => {
      vi.useFakeTimers();
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      const result = speedSetHandler(50);
      const assertion = expect(result).rejects.toBeInstanceOf(mockApi.hap.HapStatusError);
      vi.advanceTimersByTime(300);
      await flushCommands();

      await assertion;
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set fan speed: MQTT error');
    });

    it('should reject the RotationSpeed SET promise when the device is disconnected', async () => {
      vi.useFakeTimers();
      mockMqttClient.isConnected.mockReturnValue(false);

      const result = speedSetHandler(50);
      const assertion = expect(result).rejects.toBeInstanceOf(mockApi.hap.HapStatusError);
      vi.advanceTimersByTime(300);
      await flushCommands();

      await assertion;
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set fan speed: Device not connected');
    });

    it('should throw HapStatusError when setOscillation MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(swingModeSetHandler(1)).rejects.toBeInstanceOf(mockApi.hap.HapStatusError);
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set oscillation: MQTT error');
    });

    it('should throw HapStatusError when setAutoMode MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(targetStateSetHandler(1)).rejects.toBeInstanceOf(mockApi.hap.HapStatusError);
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set auto mode: MQTT error');
    });
  });
});
