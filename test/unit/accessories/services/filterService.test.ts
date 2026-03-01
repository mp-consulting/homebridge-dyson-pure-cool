/**
 * FilterService Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { FilterService } from '../../../../src/accessories/services/filterService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { DysonMqttClient } from '../../../../src/protocol/mqttClient.js';
import type { API, Logging, PlatformAccessory, Service, Characteristic } from 'homebridge';

// Create mock MQTT client
function createMockMqttClient() {
  const eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const mockClient = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockClient;
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribeToStatus: vi.fn().mockResolvedValue(undefined),
    requestCurrentState: vi.fn().mockResolvedValue(undefined),
    publishCommand: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    _emit: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
  };

  return mockClient as unknown as Mocked<DysonMqttClient> & { _emit: (event: string, ...args: unknown[]) => void };
}

// Create mock characteristic
function createMockCharacteristic() {
  const characteristic = {
    onGet: vi.fn().mockReturnThis(),
    onSet: vi.fn().mockReturnThis(),
    setProps: vi.fn().mockReturnThis(),
    updateValue: vi.fn().mockReturnThis(),
    value: 0,
  };
  return characteristic as unknown as Mocked<Characteristic>;
}

// Create mock service
function createMockService() {
  const characteristics = new Map<string, ReturnType<typeof createMockCharacteristic>>();

  const service = {
    setCharacteristic: vi.fn().mockReturnThis(),
    getCharacteristic: vi.fn((char: unknown) => {
      const key = String(char);
      if (!characteristics.has(key)) {
        characteristics.set(key, createMockCharacteristic());
      }
      return characteristics.get(key)!;
    }),
    updateCharacteristic: vi.fn().mockReturnThis(),
    addOptionalCharacteristic: vi.fn().mockReturnThis(),
    addLinkedService: vi.fn().mockReturnThis(),
    _getCharacteristics: () => characteristics,
  };

  return service as unknown as Mocked<Service> & {
    _getCharacteristics: () => Map<string, ReturnType<typeof createMockCharacteristic>>;
  };
}

// Create mock API
function createMockApi() {
  const mockFilterService = createMockService();

  return {
    hap: {
      Service: {
        FilterMaintenance: 'FilterMaintenance',
      },
      Characteristic: {
        Name: 'Name',
        FilterLifeLevel: 'FilterLifeLevel',
        FilterChangeIndication: 'FilterChangeIndication',
        ConfiguredName: 'ConfiguredName',
      },
    },
    _mockFilterService: mockFilterService,
  } as unknown as Mocked<API> & {
    _mockFilterService: ReturnType<typeof createMockService>;
  };
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: vi.fn((serviceType: unknown) => {
      if (serviceType === 'filter-maintenance') {
        return api._mockFilterService;
      }
      return undefined;
    }),
    addService: vi.fn(() => api._mockFilterService),
    context: {},
  } as unknown as Mocked<PlatformAccessory>;
}

// Create mock logger
function createMockLog(): Mocked<Logging> {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  } as unknown as Mocked<Logging>;
}

describe('FilterService', () => {
  let service: FilterService;
  let device: DysonLinkDevice;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let mockApi: ReturnType<typeof createMockApi>;
  let mockAccessory: ReturnType<typeof createMockAccessory>;
  let mockLog: Mocked<Logging>;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '438',
    name: 'Living Room',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(() => {
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    mockApi = createMockApi();
    mockAccessory = createMockAccessory(mockApi);
    mockLog = createMockLog();

    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create FilterMaintenance service', () => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getService).toHaveBeenCalledWith('filter-maintenance');
    });

    it('should set configured name', () => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockFilterService.addOptionalCharacteristic).toHaveBeenCalledWith(
        'ConfiguredName',
      );
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(
        'ConfiguredName',
        'Filter',
      );
    });

    it('should register characteristic handlers', () => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const chars = mockApi._mockFilterService._getCharacteristics();
      expect(chars.get('FilterLifeLevel')?.onGet).toHaveBeenCalled();
      expect(chars.get('FilterChangeIndication')?.onGet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockFilterService);
    });
  });

  describe('FilterLifeLevel', () => {
    let filterLifeGetHandler: () => number;

    beforeEach(() => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const filterLifeChar = mockApi._mockFilterService._getCharacteristics().get('FilterLifeLevel');
      filterLifeGetHandler = filterLifeChar!.onGet.mock.calls[0][0] as () => number;
    });

    it('should return 100% when filter life is undefined', () => {
      device.state.hepaFilterLife = undefined;
      device.state.carbonFilterLife = undefined;
      expect(filterLifeGetHandler()).toBe(100);
    });

    it('should return 100% when filter is new (4300 hours)', () => {
      device.state.hepaFilterLife = 4300;
      expect(filterLifeGetHandler()).toBe(100);
    });

    it('should return 50% when filter is half used', () => {
      device.state.hepaFilterLife = 2150;
      expect(filterLifeGetHandler()).toBe(50);
    });

    it('should return 10% when filter is nearly depleted', () => {
      device.state.hepaFilterLife = 430;
      expect(filterLifeGetHandler()).toBe(10);
    });

    it('should return 0% when filter is depleted', () => {
      device.state.hepaFilterLife = 0;
      expect(filterLifeGetHandler()).toBe(0);
    });

    it('should use carbon filter as fallback', () => {
      device.state.hepaFilterLife = undefined;
      device.state.carbonFilterLife = 2150;
      expect(filterLifeGetHandler()).toBe(50);
    });

    it('should clamp to 0% for negative values', () => {
      device.state.hepaFilterLife = -100;
      expect(filterLifeGetHandler()).toBe(100); // Negative treated as unknown
    });
  });

  describe('FilterChangeIndication', () => {
    let filterChangeGetHandler: () => number;

    beforeEach(() => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const filterChangeChar = mockApi._mockFilterService._getCharacteristics().get('FilterChangeIndication');
      filterChangeGetHandler = filterChangeChar!.onGet.mock.calls[0][0] as () => number;
    });

    it('should return 0 (no change needed) when filter is new', () => {
      device.state.hepaFilterLife = 4300;
      expect(filterChangeGetHandler()).toBe(0);
    });

    it('should return 0 when filter is at 50%', () => {
      device.state.hepaFilterLife = 2150;
      expect(filterChangeGetHandler()).toBe(0);
    });

    it('should return 0 when filter is at 11%', () => {
      device.state.hepaFilterLife = 473; // ~11%
      expect(filterChangeGetHandler()).toBe(0);
    });

    it('should return 1 (change needed) when filter is at 10%', () => {
      device.state.hepaFilterLife = 430; // 10%
      expect(filterChangeGetHandler()).toBe(1);
    });

    it('should return 1 when filter is at 5%', () => {
      device.state.hepaFilterLife = 215;
      expect(filterChangeGetHandler()).toBe(1);
    });

    it('should return 1 when filter is depleted', () => {
      device.state.hepaFilterLife = 0;
      expect(filterChangeGetHandler()).toBe(1);
    });
  });

  describe('state change handling', () => {
    beforeEach(() => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should update characteristics on state change', () => {
      device.updateState({ hepaFilterLife: 2150 });

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith('FilterLifeLevel', 50);
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith('FilterChangeIndication', 0);
    });

    it('should indicate change needed when filter is low', () => {
      device.updateState({ hepaFilterLife: 200 });

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith('FilterLifeLevel', 5);
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith('FilterChangeIndication', 1);
    });
  });

  describe('updateFromState', () => {
    it('should update characteristics from current device state', () => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      device.state.hepaFilterLife = 3225; // 75%

      mockApi._mockFilterService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith('FilterLifeLevel', 75);
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith('FilterChangeIndication', 0);
    });
  });
});
