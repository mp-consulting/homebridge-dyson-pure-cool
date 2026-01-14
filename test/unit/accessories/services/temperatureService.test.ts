/**
 * TemperatureService Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { TemperatureService } from '../../../../src/accessories/services/temperatureService.js';
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
  const mockTempService = createMockService();

  return {
    hap: {
      Service: {
        TemperatureSensor: 'TemperatureSensor',
      },
      Characteristic: {
        Name: 'Name',
        CurrentTemperature: 'CurrentTemperature',
      },
    },
    _mockTempService: mockTempService,
  } as unknown as jest.Mocked<API> & {
    _mockTempService: ReturnType<typeof createMockService>;
  };
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'TemperatureSensor') {
        return api._mockTempService;
      }
      return undefined;
    }),
    addService: jest.fn(() => api._mockTempService),
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

describe('TemperatureService', () => {
  let service: TemperatureService;
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
    it('should get or create TemperatureSensor service', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getService).toHaveBeenCalledWith('TemperatureSensor');
    });

    it('should set display name', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockTempService.setCharacteristic).toHaveBeenCalledWith(
        'Name',
        'Test Dyson Temperature',
      );
    });

    it('should register CurrentTemperature characteristic handler', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const tempChar = mockApi._mockTempService._getCharacteristics().get('CurrentTemperature');
      expect(tempChar?.onGet).toHaveBeenCalled();
      expect(tempChar?.setProps).toHaveBeenCalledWith({
        minValue: -40,
        maxValue: 100,
        minStep: 0.1,
      });
    });

    it('should return the service', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockTempService);
    });
  });

  describe('temperature conversion', () => {
    beforeEach(() => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should convert 2950 (Kelvin×10) to 21.85°C', () => {
      // 2950 / 10 = 295K; 295K - 273.15 = 21.85°C
      // Simulate state change
      device.updateState({ temperature: 2950 });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(21.9, 0.1), // Rounded to 1 decimal
      );
    });

    it('should convert 2731 (Kelvin×10) to ~0°C', () => {
      device.updateState({ temperature: 2731 });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(0, 0.1),
      );
    });

    it('should return 20°C default when temperature is undefined', () => {
      device.updateState({ temperature: undefined });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        20,
      );
    });

    it('should return 20°C default when temperature is 0', () => {
      device.updateState({ temperature: 0 });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        20,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update characteristic from current device state', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      // Set state then call updateFromState
      device.state.temperature = 2932; // ~20°C

      mockApi._mockTempService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(20, 0.1),
      );
    });
  });

  describe('handleTemperatureGet (HomeKit GET requests)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let temperatureGetHandler: (...args: any[]) => number;

    beforeEach(() => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      // Extract the GET handler from the onGet mock
      const tempChar = mockApi._mockTempService._getCharacteristics().get('CurrentTemperature');
      temperatureGetHandler = tempChar!.onGet.mock.calls[0][0] as (...args: unknown[]) => number;
    });

    it('should return default 20°C when temperature is undefined', () => {
      const result = temperatureGetHandler();
      expect(result).toBe(20);
    });

    it('should return converted temperature for valid Kelvin×10 value', () => {
      device.state.temperature = 2950; // ~21.85°C
      const result = temperatureGetHandler();
      expect(result).toBeCloseTo(21.9, 1);
    });

    it('should log debug message when GET is called', () => {
      device.state.temperature = 2950;
      temperatureGetHandler();
      expect(mockLog.debug).toHaveBeenCalledWith('Get Temperature ->', expect.any(Number), '°C');
    });

    it('should return default 20°C for zero temperature', () => {
      device.state.temperature = 0;
      const result = temperatureGetHandler();
      expect(result).toBe(20);
    });

    it('should return default 20°C for negative temperature', () => {
      device.state.temperature = -100;
      const result = temperatureGetHandler();
      expect(result).toBe(20);
    });
  });
});
