/**
 * JetFocusService Unit Tests
 */

import { vi, type Mock } from 'vitest';

import { JetFocusService } from '../../../../src/accessories/services/jetFocusService.js';
import type { JetFocusServiceConfig } from '../../../../src/accessories/services/jetFocusService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { emitProductState, setDeviceState } from '../../../helpers/device.js';

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

describe('JetFocusService', () => {
  let jetFocusService: JetFocusService;
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
    serial: 'HP04-AB-12345678',
    productType: '527',
    name: 'Living Room Fan',
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
      displayName: 'Living Room Fan',
      getServiceById: vi.fn().mockReturnValue(null),
      addService: vi.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: JetFocusServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    jetFocusService = new JetFocusService(config);

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
    it('should create Switch service with jet-focus subtype', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.Switch,
        'jet-focus',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.Switch,
        'Jet Focus',
        'jet-focus',
      );
    });

    it('should set configured name', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Jet Focus',
      );
    });

    it('should register On characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.On);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(jetFocusService.getService()).toBe(mockService);
    });

    it('should use existing service if available', async () => {
      // Create a new accessory with existing service
      const existingService = createMockService(null);
      const accessoryWithExistingService = {
        displayName: 'Living Room Fan',
        getServiceById: vi.fn().mockReturnValue(existingService),
        addService: vi.fn().mockReturnValue(mockService),
      } as unknown as PlatformAccessory;

      const config: JetFocusServiceConfig = {
        accessory: accessoryWithExistingService,
        device,
        api: mockApi,
        log: mockLog,
      };

      const service = new JetFocusService(config);

      expect(accessoryWithExistingService.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.Switch,
        'jet-focus',
      );
      expect(accessoryWithExistingService.addService).not.toHaveBeenCalled();
      expect(service.getService()).toBe(existingService);
    });
  });

  describe('On characteristic', () => {
    it('should return false when jet focus is off', () => {
      const result = onGetHandler();
      expect(result).toBe(false);
    });

    it('should return true when jet focus is on', async () => {
      // Set frontAirflow state directly on device
      setDeviceState(device, { frontAirflow: true });

      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should call setJetFocus(true) when set to true', async () => {
      await onSetHandler(true);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { ffoc: 'ON' },
        }),
      );
    });

    it('should call setJetFocus(false) when set to false', async () => {
      await onSetHandler(false);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ffoc: 'OFF' },
        }),
      );
    });
  });

  describe('state change handling', () => {
    it('should update On characteristic when device state changes', async () => {
      // Update device state with frontAirflow
      emitProductState(mockMqttClient, { ffoc: 'ON' });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        true,
      );
    });

    it('should update characteristic when jet focus turns off', async () => {
      // First turn on
      emitProductState(mockMqttClient, { ffoc: 'ON' });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      emitProductState(mockMqttClient, { ffoc: 'OFF' });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        false,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update On characteristic from current device state', async () => {
      // Set device state directly
      setDeviceState(device, { frontAirflow: true });

      mockService.updateCharacteristic.mockClear();

      jetFocusService.updateFromState();

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        true,
      );
    });

    it('should update with false when frontAirflow is undefined', async () => {
      mockService.updateCharacteristic.mockClear();

      jetFocusService.updateFromState();

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        false,
      );
    });
  });

  describe('error handling', () => {
    it('should log and throw HapStatusError when setJetFocus MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(onSetHandler(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set jet focus: MQTT error');
    });

    it('should throw HapStatusError when setting while the device is disconnected', async () => {
      await device.disconnect();

      await expect(onSetHandler(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to set jet focus:'));
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

      const service = new JetFocusService({
        accessory: accessoryWithExistingService,
        device,
        api: mockApi,
        log: mockLog,
      });

      expect(accessoryWithExistingService.getServiceById).toHaveBeenCalledWith(mockApi.hap.Service.Switch, 'jet-focus');
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
      jetFocusService.updateFromState();
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

      jetFocusService.updateFromState();
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.On, expect.any(Boolean));
    });

    it('should push On when the ffoc field changes', () => {
      mockService.updateCharacteristic.mockClear();
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { ffoc: 'OFF' } },
      });
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { ffoc: 'ON' } },
      });
      expect(mockService.updateCharacteristic).toHaveBeenLastCalledWith(mockApi.hap.Characteristic.On, true);
    });
  });
});
