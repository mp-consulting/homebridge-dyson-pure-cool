/**
 * JetFocusService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { JetFocusService } from '../../../../src/accessories/services/jetFocusService.js';
import type { JetFocusServiceConfig } from '../../../../src/accessories/services/jetFocusService.js';
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
    On: { UUID: 'on-uuid' },
    Name: { UUID: 'name-uuid' },
    ConfiguredName: { UUID: 'configured-name-uuid' },
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
    mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room Fan',
      getServiceById: jest.fn().mockReturnValue(null),
      addService: jest.fn().mockReturnValue(mockService),
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
    onGetHandler = (onChar!.onGet as jest.Mock).mock.calls[0][0];
    onSetHandler = (onChar!.onSet as jest.Mock).mock.calls[0][0];
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      const existingService = createMockService();
      const accessoryWithExistingService = {
        displayName: 'Living Room Fan',
        getServiceById: jest.fn().mockReturnValue(existingService),
        addService: jest.fn().mockReturnValue(mockService),
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
      device.state.frontAirflow = true;

      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should call setJetFocus(true) when set to true', async () => {
      await onSetHandler(true);

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
      device.updateState({
        frontAirflow: true,
      });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        true,
      );
    });

    it('should update characteristic when jet focus turns off', async () => {
      // First turn on
      device.updateState({
        frontAirflow: true,
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      device.updateState({
        frontAirflow: false,
      });

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
      device.state.frontAirflow = true;

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
    it('should throw and log error when setJetFocus fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      await expect(onSetHandler(true)).rejects.toThrow('MQTT error');
      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
