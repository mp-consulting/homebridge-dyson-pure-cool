/**
 * HumidityService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { HumidityService } from '../../../../src/accessories/services/humidityService.js';
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
    value: 0,
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
    addOptionalCharacteristic: jest.fn().mockReturnThis(),
    addLinkedService: jest.fn().mockReturnThis(),
    _getCharacteristics: () => characteristics,
  };

  return service as unknown as jest.Mocked<Service> & {
    _getCharacteristics: () => Map<string, ReturnType<typeof createMockCharacteristic>>;
  };
}

// Create mock API
function createMockApi() {
  const mockHumidityService = createMockService();

  return {
    hap: {
      Service: {
        HumiditySensor: 'HumiditySensor',
      },
      Characteristic: {
        Name: 'Name',
        CurrentRelativeHumidity: 'CurrentRelativeHumidity',
        ConfiguredName: 'ConfiguredName',
      },
    },
    _mockHumidityService: mockHumidityService,
  } as unknown as jest.Mocked<API> & {
    _mockHumidityService: ReturnType<typeof createMockService>;
  };
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'humidity-sensor') {
        return api._mockHumidityService;
      }
      return undefined;
    }),
    addService: jest.fn(() => api._mockHumidityService),
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

describe('HumidityService', () => {
  let service: HumidityService;
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
    it('should get or create HumiditySensor service', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getService).toHaveBeenCalledWith('humidity-sensor');
    });

    it('should set configured name', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockHumidityService.addOptionalCharacteristic).toHaveBeenCalledWith(
        'ConfiguredName',
      );
      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'ConfiguredName',
        'Humidity',
      );
    });

    it('should register CurrentRelativeHumidity characteristic handler', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const humidityChar = mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity');
      expect(humidityChar?.onGet).toHaveBeenCalled();
      expect(humidityChar?.setProps).toHaveBeenCalledWith({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });
    });

    it('should return the service', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockHumidityService);
    });
  });

  describe('humidity values', () => {
    beforeEach(() => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should report humidity as-is (direct percentage)', () => {
      device.updateState({ humidity: 45 });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        45,
      );
    });

    it('should report 0% humidity', () => {
      device.updateState({ humidity: 0 });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        0,
      );
    });

    it('should report 100% humidity', () => {
      device.updateState({ humidity: 100 });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        100,
      );
    });

    it('should return 50% default when humidity is undefined', () => {
      device.updateState({ humidity: undefined });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        50,
      );
    });

    it('should return 50% default when humidity is out of range (negative)', () => {
      device.updateState({ humidity: -5 });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        50,
      );
    });

    it('should return 50% default when humidity is out of range (>100)', () => {
      device.updateState({ humidity: 150 });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        50,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update characteristic from current device state', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      // Set state then call updateFromState
      device.state.humidity = 65;

      mockApi._mockHumidityService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        65,
      );
    });
  });

  describe('handleHumidityGet (HomeKit GET requests)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let humidityGetHandler: (...args: any[]) => number;

    beforeEach(() => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      // Extract the GET handler from the onGet mock
      const humidityChar = mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity');
      humidityGetHandler = humidityChar!.onGet.mock.calls[0][0] as (...args: unknown[]) => number;
    });

    it('should return default 50% when humidity is undefined', () => {
      const result = humidityGetHandler();
      expect(result).toBe(50);
    });

    it('should return humidity value directly', () => {
      device.state.humidity = 45;
      const result = humidityGetHandler();
      expect(result).toBe(45);
    });

    it('should log debug message when GET is called', () => {
      device.state.humidity = 60;
      humidityGetHandler();
      expect(mockLog.debug).toHaveBeenCalledWith('Get Humidity ->', 60, '%');
    });

    it('should return default 50% for negative humidity', () => {
      device.state.humidity = -10;
      const result = humidityGetHandler();
      expect(result).toBe(50);
    });

    it('should return default 50% for humidity > 100', () => {
      device.state.humidity = 150;
      const result = humidityGetHandler();
      expect(result).toBe(50);
    });

    it('should return 0% for zero humidity (valid)', () => {
      device.state.humidity = 0;
      const result = humidityGetHandler();
      expect(result).toBe(0);
    });

    it('should return 100% for 100 humidity (valid)', () => {
      device.state.humidity = 100;
      const result = humidityGetHandler();
      expect(result).toBe(100);
    });
  });
});
