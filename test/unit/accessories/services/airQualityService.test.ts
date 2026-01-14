/**
 * AirQualityService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { AirQualityService } from '../../../../src/accessories/services/airQualityService.js';
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
    _getCharacteristics: () => characteristics,
  };

  return service as unknown as jest.Mocked<Service> & {
    _getCharacteristics: () => Map<string, ReturnType<typeof createMockCharacteristic>>;
  };
}

// Create mock API
function createMockApi() {
  const mockAirQualityService = createMockService();

  return {
    hap: {
      Service: {
        AirQualitySensor: 'AirQualitySensor',
      },
      Characteristic: {
        Name: 'Name',
        AirQuality: 'AirQuality',
        PM2_5Density: 'PM2_5Density',
        PM10Density: 'PM10Density',
        VOCDensity: 'VOCDensity',
      },
    },
    _mockAirQualityService: mockAirQualityService,
  } as unknown as jest.Mocked<API> & {
    _mockAirQualityService: ReturnType<typeof createMockService>;
  };
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'AirQualitySensor') {
        return api._mockAirQualityService;
      }
      return undefined;
    }),
    addService: jest.fn(() => api._mockAirQualityService),
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

describe('AirQualityService', () => {
  let service: AirQualityService;
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
    it('should get or create AirQualitySensor service', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getService).toHaveBeenCalledWith('AirQualitySensor');
    });

    it('should set display name', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockAirQualityService.setCharacteristic).toHaveBeenCalledWith(
        'Name',
        'Test Dyson Air Quality',
      );
    });

    it('should register all characteristic handlers', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const chars = mockApi._mockAirQualityService._getCharacteristics();
      expect(chars.get('AirQuality')?.onGet).toHaveBeenCalled();
      expect(chars.get('PM2_5Density')?.onGet).toHaveBeenCalled();
      expect(chars.get('PM10Density')?.onGet).toHaveBeenCalled();
      expect(chars.get('VOCDensity')?.onGet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockAirQualityService);
    });
  });

  describe('AirQuality calculation', () => {
    let airQualityGetHandler: () => number;

    beforeEach(() => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const airQualityChar = mockApi._mockAirQualityService._getCharacteristics().get('AirQuality');
      airQualityGetHandler = airQualityChar!.onGet.mock.calls[0][0] as () => number;
    });

    it('should return UNKNOWN (0) when PM2.5 is undefined', () => {
      device.state.pm25 = undefined;
      expect(airQualityGetHandler()).toBe(0);
    });

    it('should return UNKNOWN (0) when PM2.5 is negative', () => {
      device.state.pm25 = -1;
      expect(airQualityGetHandler()).toBe(0);
    });

    it('should return EXCELLENT (1) for PM2.5 0-12', () => {
      device.state.pm25 = 0;
      expect(airQualityGetHandler()).toBe(1);

      device.state.pm25 = 12;
      expect(airQualityGetHandler()).toBe(1);
    });

    it('should return GOOD (2) for PM2.5 13-35', () => {
      device.state.pm25 = 13;
      expect(airQualityGetHandler()).toBe(2);

      device.state.pm25 = 35;
      expect(airQualityGetHandler()).toBe(2);
    });

    it('should return FAIR (3) for PM2.5 36-55', () => {
      device.state.pm25 = 36;
      expect(airQualityGetHandler()).toBe(3);

      device.state.pm25 = 55;
      expect(airQualityGetHandler()).toBe(3);
    });

    it('should return INFERIOR (4) for PM2.5 56-150', () => {
      device.state.pm25 = 56;
      expect(airQualityGetHandler()).toBe(4);

      device.state.pm25 = 150;
      expect(airQualityGetHandler()).toBe(4);
    });

    it('should return POOR (5) for PM2.5 > 150', () => {
      device.state.pm25 = 151;
      expect(airQualityGetHandler()).toBe(5);

      device.state.pm25 = 500;
      expect(airQualityGetHandler()).toBe(5);
    });
  });

  describe('PM2.5 Density', () => {
    let pm25GetHandler: () => number;

    beforeEach(() => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const pm25Char = mockApi._mockAirQualityService._getCharacteristics().get('PM2_5Density');
      pm25GetHandler = pm25Char!.onGet.mock.calls[0][0] as () => number;
    });

    it('should return 0 when PM2.5 is undefined', () => {
      device.state.pm25 = undefined;
      expect(pm25GetHandler()).toBe(0);
    });

    it('should return PM2.5 value directly', () => {
      device.state.pm25 = 42;
      expect(pm25GetHandler()).toBe(42);
    });
  });

  describe('PM10 Density', () => {
    let pm10GetHandler: () => number;

    beforeEach(() => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const pm10Char = mockApi._mockAirQualityService._getCharacteristics().get('PM10Density');
      pm10GetHandler = pm10Char!.onGet.mock.calls[0][0] as () => number;
    });

    it('should return 0 when PM10 is undefined', () => {
      device.state.pm10 = undefined;
      expect(pm10GetHandler()).toBe(0);
    });

    it('should return PM10 value directly', () => {
      device.state.pm10 = 85;
      expect(pm10GetHandler()).toBe(85);
    });
  });

  describe('VOC Index', () => {
    let vocGetHandler: () => number;

    beforeEach(() => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const vocChar = mockApi._mockAirQualityService._getCharacteristics().get('VOCDensity');
      vocGetHandler = vocChar!.onGet.mock.calls[0][0] as () => number;
    });

    it('should return 0 when VOC is undefined', () => {
      device.state.vocIndex = undefined;
      expect(vocGetHandler()).toBe(0);
    });

    it('should return VOC index value directly', () => {
      device.state.vocIndex = 3;
      expect(vocGetHandler()).toBe(3);
    });
  });

  describe('state change handling', () => {
    beforeEach(() => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should update all characteristics on state change', () => {
      device.updateState({
        pm25: 25,
        pm10: 50,
        vocIndex: 2,
      });

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('AirQuality', 2);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('PM2_5Density', 25);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('PM10Density', 50);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('VOCDensity', 2);
    });

    it('should handle undefined values in state change', () => {
      device.updateState({
        pm25: undefined,
        pm10: undefined,
        vocIndex: undefined,
      });

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('AirQuality', 0);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('PM2_5Density', 0);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('PM10Density', 0);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('VOCDensity', 0);
    });
  });

  describe('updateFromState', () => {
    it('should update all characteristics from current device state', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      device.state.pm25 = 10;
      device.state.pm10 = 20;
      device.state.vocIndex = 1;

      mockApi._mockAirQualityService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('AirQuality', 1);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('PM2_5Density', 10);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('PM10Density', 20);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith('VOCDensity', 1);
    });
  });
});
