/**
 * NightModeService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { NightModeService } from '../../../../src/accessories/services/nightModeService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { DysonMqttClient } from '../../../../src/protocol/mqttClient.js';
import type { API, Logging, PlatformAccessory, Service, Characteristic } from 'homebridge';

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

// Create mock characteristic
function createMockCharacteristic() {
  const characteristic = {
    onGet: jest.fn().mockReturnThis(),
    onSet: jest.fn().mockReturnThis(),
    setProps: jest.fn().mockReturnThis(),
    updateValue: jest.fn().mockReturnThis(),
    value: false,
  };
  return characteristic as unknown as jest.Mocked<Characteristic>;
}

// Create mock service
function createMockService() {
  const characteristics = new Map<string, ReturnType<typeof createMockCharacteristic>>();

  const service = {
    setCharacteristic: jest.fn().mockReturnThis(),
    getCharacteristic: jest.fn((char: unknown) => {
      const key = String(char);
      if (!characteristics.has(key)) {
        characteristics.set(key, createMockCharacteristic());
      }
      return characteristics.get(key)!;
    }),
    updateCharacteristic: jest.fn().mockReturnThis(),
    _getCharacteristics: () => characteristics,
  };

  return service as unknown as jest.Mocked<Service> & {
    _getCharacteristics: () => Map<string, ReturnType<typeof createMockCharacteristic>>;
  };
}

// Create mock API
function createMockApi() {
  const mockSwitchService = createMockService();

  return {
    hap: {
      Service: {
        Switch: 'Switch',
      },
      Characteristic: {
        Name: 'Name',
        On: 'On',
      },
    },
    _mockSwitchService: mockSwitchService,
  } as unknown as jest.Mocked<API> & {
    _mockSwitchService: ReturnType<typeof createMockService>;
  };
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'Night Mode') {
        return api._mockSwitchService;
      }
      return undefined;
    }),
    addService: jest.fn(() => api._mockSwitchService),
    context: {},
  } as unknown as jest.Mocked<PlatformAccessory>;
}

// Create mock logger
function createMockLog(): jest.Mocked<Logging> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
  } as unknown as jest.Mocked<Logging>;
}

describe('NightModeService', () => {
  let service: NightModeService;
  let device: DysonLinkDevice;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let mockApi: ReturnType<typeof createMockApi>;
  let mockAccessory: ReturnType<typeof createMockAccessory>;
  let mockLog: jest.Mocked<Logging>;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '438',
    name: 'Living Room',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(() => {
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    mockApi = createMockApi();
    mockAccessory = createMockAccessory(mockApi);
    mockLog = createMockLog();

    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create Switch service with subtype', () => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getService).toHaveBeenCalledWith('Night Mode');
    });

    it('should create new service when not found', () => {
      mockAccessory.getService.mockReturnValue(undefined);

      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.addService).toHaveBeenCalledWith('Switch', 'Night Mode', 'night-mode');
    });

    it('should set display name', () => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockSwitchService.setCharacteristic).toHaveBeenCalledWith(
        'Name',
        'Night Mode',
      );
    });

    it('should register On characteristic handlers', () => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const onChar = mockApi._mockSwitchService._getCharacteristics().get('On');
      expect(onChar?.onGet).toHaveBeenCalled();
      expect(onChar?.onSet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockSwitchService);
    });
  });

  describe('handleOnGet', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let onGetHandler: (...args: any[]) => boolean;

    beforeEach(() => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const onChar = mockApi._mockSwitchService._getCharacteristics().get('On');
      onGetHandler = onChar!.onGet.mock.calls[0][0] as (...args: unknown[]) => boolean;
    });

    it('should return false when night mode is off (default)', () => {
      const result = onGetHandler();
      expect(result).toBe(false);
    });

    it('should return true when night mode is on', () => {
      device.state.nightMode = true;
      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should log debug message', () => {
      device.state.nightMode = true;
      onGetHandler();
      expect(mockLog.debug).toHaveBeenCalledWith('Get Night Mode ->', true);
    });
  });

  describe('handleOnSet', () => {
     
    let onSetHandler: (value: boolean) => Promise<void>;

    beforeEach(async () => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      // Connect the device so setNightMode works
      await device.connect();

      const onChar = mockApi._mockSwitchService._getCharacteristics().get('On');
      onSetHandler = onChar!.onSet.mock.calls[0][0] as (value: boolean) => Promise<void>;
    });

    it('should send night mode ON command', async () => {
      await onSetHandler(true);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nmod: 'ON',
          }),
        }),
      );
    });

    it('should send night mode OFF command', async () => {
      await onSetHandler(false);

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nmod: 'OFF',
          }),
        }),
      );
    });

    it('should log debug message', async () => {
      await onSetHandler(true);
      expect(mockLog.debug).toHaveBeenCalledWith('Set Night Mode ->', true);
    });

    it('should log error and rethrow on failure', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('Network error'));

      await expect(onSetHandler(true)).rejects.toThrow('Network error');
      expect(mockLog.error).toHaveBeenCalledWith('Failed to set night mode:', expect.any(Error));
    });
  });

  describe('state change handling', () => {
    beforeEach(() => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should update characteristic when night mode turns on', () => {
      device.updateState({ nightMode: true });

      expect(mockApi._mockSwitchService.updateCharacteristic).toHaveBeenCalledWith(
        'On',
        true,
      );
    });

    it('should update characteristic when night mode turns off', () => {
      device.updateState({ nightMode: false });

      expect(mockApi._mockSwitchService.updateCharacteristic).toHaveBeenCalledWith(
        'On',
        false,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update characteristic from current device state', () => {
      service = new NightModeService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      device.state.nightMode = true;

      mockApi._mockSwitchService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockSwitchService.updateCharacteristic).toHaveBeenCalledWith(
        'On',
        true,
      );
    });
  });
});
