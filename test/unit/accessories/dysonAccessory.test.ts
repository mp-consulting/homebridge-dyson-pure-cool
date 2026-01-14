/**
 * DysonAccessory Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DysonAccessory } from '../../../src/accessories/dysonAccessory.js';
import type { DysonAccessoryConfig } from '../../../src/accessories/dysonAccessory.js';
import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory, DeviceState } from '../../../src/devices/index.js';
import type { DysonMqttClient } from '../../../src/protocol/mqttClient.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';

// Track setupServices calls globally since class property initialization
// happens after super() but setupServices is called during super()
let setupServicesCallCount = 0;

// Concrete test implementation of abstract DysonAccessory
class TestAccessory extends DysonAccessory {
  public stateChangeHandler?: (state: DeviceState) => void;

  protected setupServices(): void {
    setupServicesCallCount++;
  }

  protected handleStateChange(state: DeviceState): void {
    super.handleStateChange(state);
    if (this.stateChangeHandler) {
      this.stateChangeHandler(state);
    }
  }

  static getSetupServicesCallCount(): number {
    return setupServicesCallCount;
  }

  static resetSetupServicesCallCount(): void {
    setupServicesCallCount = 0;
  }
}

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

// Create mock AccessoryInformation service
function createMockInfoService() {
  return {
    setCharacteristic: jest.fn().mockReturnThis(),
    getCharacteristic: jest.fn().mockReturnThis(),
  };
}

// Create mock API
function createMockApi() {
  const mockInfoService = createMockInfoService();

  const Characteristic = {
    Manufacturer: { UUID: 'manufacturer-uuid' },
    Model: { UUID: 'model-uuid' },
    SerialNumber: { UUID: 'serial-uuid' },
    FirmwareRevision: { UUID: 'firmware-uuid' },
  };

  const Service = {
    AccessoryInformation: { UUID: 'accessory-info-uuid' },
    Fanv2: { UUID: 'fanv2-uuid' },
  };

  return {
    hap: {
      Service,
      Characteristic,
    },
    _mockInfoService: mockInfoService,
  } as unknown as API & { _mockInfoService: ReturnType<typeof createMockInfoService> };
}

describe('DysonAccessory', () => {
  let accessory: TestAccessory;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let device: DysonLinkDevice;
  let mockAccessory: PlatformAccessory;
  let mockLog: Logging;
  let mockApi: ReturnType<typeof createMockApi>;
  let mockInfoService: ReturnType<typeof createMockInfoService>;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '438',
    name: 'Living Room',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(async () => {
    // Reset call counter
    TestAccessory.resetSetupServicesCallCount();

    // Set up mocks
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = jest.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockLog = createMockLog();
    mockApi = createMockApi();
    mockInfoService = mockApi._mockInfoService;

    mockAccessory = {
      displayName: 'Living Room',
      getService: jest.fn((serviceType: unknown) => {
        const uuid = typeof serviceType === 'object' && serviceType !== null && 'UUID' in serviceType
          ? (serviceType as { UUID: string }).UUID
          : String(serviceType);
        if (uuid === 'accessory-info-uuid') {
          return mockInfoService;
        }
        return undefined;
      }),
      addService: jest.fn().mockReturnValue({}),
      removeService: jest.fn(),
    } as unknown as PlatformAccessory;

    // Connect device
    await device.connect();

    const config: DysonAccessoryConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    accessory = new TestAccessory(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should call setupServices', () => {
      expect(TestAccessory.getSetupServicesCallCount()).toBe(1);
    });

    it('should set up AccessoryInformation service', () => {
      expect(mockAccessory.getService).toHaveBeenCalledWith(mockApi.hap.Service.AccessoryInformation);
      expect(mockInfoService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Manufacturer,
        'Dyson',
      );
      expect(mockInfoService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.SerialNumber,
        'ABC-AB-12345678',
      );
    });

    it('should set model name based on product type', () => {
      expect(mockInfoService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Model,
        'Pure Cool Tower (TP04)',
      );
    });

    it('should log initialization', () => {
      expect(mockLog.debug).toHaveBeenCalledWith(
        'DysonAccessory initialized for',
        'Living Room',
      );
    });
  });

  describe('model name mapping', () => {
    it('should return correct model name for HP02 (455)', async () => {
      const hp02Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '455' },
        mockMqttClientFactory,
      );
      await hp02Device.connect();

      const newMockInfoService = createMockInfoService();
      const newMockAccessory = {
        ...mockAccessory,
        getService: jest.fn((serviceType: unknown) => {
          const uuid = typeof serviceType === 'object' && serviceType !== null && 'UUID' in serviceType
            ? (serviceType as { UUID: string }).UUID
            : String(serviceType);
          if (uuid === 'accessory-info-uuid') {
            return newMockInfoService;
          }
          return undefined;
        }),
      } as unknown as PlatformAccessory;

      new TestAccessory({
        accessory: newMockAccessory,
        device: hp02Device,
        api: mockApi,
        log: mockLog,
      });

      expect(newMockInfoService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Model,
        'Pure Hot+Cool Link (HP02)',
      );
    });

    it('should return generic name for unknown product type', async () => {
      const unknownDevice = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '999' },
        mockMqttClientFactory,
      );
      await unknownDevice.connect();

      const newMockInfoService = createMockInfoService();
      const newMockAccessory = {
        ...mockAccessory,
        getService: jest.fn((serviceType: unknown) => {
          const uuid = typeof serviceType === 'object' && serviceType !== null && 'UUID' in serviceType
            ? (serviceType as { UUID: string }).UUID
            : String(serviceType);
          if (uuid === 'accessory-info-uuid') {
            return newMockInfoService;
          }
          return undefined;
        }),
      } as unknown as PlatformAccessory;

      new TestAccessory({
        accessory: newMockAccessory,
        device: unknownDevice,
        api: mockApi,
        log: mockLog,
      });

      expect(newMockInfoService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.Model,
        'Dyson (999)',
      );
    });
  });

  describe('device event handling', () => {
    it('should subscribe to device stateChange events', () => {
      const stateHandler = jest.fn();
      accessory.stateChangeHandler = stateHandler;

      // Simulate state change
      mockMqttClient._emit('message', {
        topic: 'status',
        payload: Buffer.from('{}'),
        data: { msg: 'STATE-CHANGE', 'product-state': { fpwr: 'ON' } },
      });

      expect(stateHandler).toHaveBeenCalled();
    });

    it('should log on device connect', () => {
      // Simulate connect event
      mockMqttClient._emit('connect');

      expect(mockLog.info).toHaveBeenCalledWith(
        'Device connected:',
        'Living Room',
      );
    });

    it('should log warning on device disconnect', () => {
      // Simulate disconnect event
      mockMqttClient._emit('disconnect');

      expect(mockLog.warn).toHaveBeenCalledWith(
        'Device disconnected:',
        'Living Room',
      );
    });
  });

  describe('getters', () => {
    it('should return the accessory', () => {
      expect(accessory.getAccessory()).toBe(mockAccessory);
    });

    it('should return the device', () => {
      expect(accessory.getDevice()).toBe(device);
    });
  });
});
