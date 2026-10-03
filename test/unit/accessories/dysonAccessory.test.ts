/**
 * DysonAccessory Unit Tests
 */

import { vi } from 'vitest';

import { DysonAccessory } from '../../../src/accessories/dysonAccessory.js';
import type { DysonAccessoryConfig } from '../../../src/accessories/dysonAccessory.js';
import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory, DeviceState } from '../../../src/devices/index.js';
import type { API, PlatformAccessory, Logging } from 'homebridge';
import { createMockLog, createMockMqttClient } from '../../helpers/mocks.js';

// Track setupServices calls globally
let setupServicesCallCount = 0;

// Concrete test implementation of abstract DysonAccessory.
// Like real subclasses, it calls setupServices() at the end of its own constructor.
class TestAccessory extends DysonAccessory {
  public stateChangeHandler?: (state: DeviceState) => void;

  constructor(config: DysonAccessoryConfig) {
    super(config);
    this.setupServices();
  }

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

// Subclass that does NOT call setupServices(), to check the base class doesn't either
class BareAccessory extends DysonAccessory {
  protected setupServices(): void {
    setupServicesCallCount++;
  }
}

// Create mock AccessoryInformation service
function createMockInfoService() {
  return {
    setCharacteristic: vi.fn().mockReturnThis(),
    getCharacteristic: vi.fn().mockReturnThis(),
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
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockLog = createMockLog();
    mockApi = createMockApi();
    mockInfoService = mockApi._mockInfoService;

    mockAccessory = {
      displayName: 'Living Room',
      getService: vi.fn((serviceType: unknown) => {
        const uuid = typeof serviceType === 'object' && serviceType !== null && 'UUID' in serviceType
          ? (serviceType as { UUID: string }).UUID
          : String(serviceType);
        if (uuid === 'accessory-info-uuid') {
          return mockInfoService;
        }
        return undefined;
      }),
      addService: vi.fn().mockReturnValue({}),
      removeService: vi.fn(),
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
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should call setupServices once when the subclass invokes it', () => {
      expect(TestAccessory.getSetupServicesCallCount()).toBe(1);
    });

    it('should not call setupServices from the base constructor', () => {
      TestAccessory.resetSetupServicesCallCount();

      new BareAccessory({ accessory: mockAccessory, device, api: mockApi, log: mockLog });

      expect(TestAccessory.getSetupServicesCallCount()).toBe(0);
    });

    it('should not set FirmwareRevision when firmwareVersion is not passed', () => {
      expect(mockInfoService.setCharacteristic).not.toHaveBeenCalledWith(
        mockApi.hap.Characteristic.FirmwareRevision,
        expect.anything(),
      );
    });

    it('should set FirmwareRevision when firmwareVersion is passed', () => {
      mockInfoService.setCharacteristic.mockClear();

      new TestAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi,
        log: mockLog,
        firmwareVersion: '21.04.03',
      });

      expect(mockInfoService.setCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.FirmwareRevision,
        '21.04.03',
      );
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
        'Dyson Pure Cool Tower (TP04)',
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
        getService: vi.fn((serviceType: unknown) => {
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
        'Dyson Pure Hot+Cool Link (HP02)',
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
        getService: vi.fn((serviceType: unknown) => {
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
        'Dyson Device (999)',
      );
    });
  });

  describe('device event handling', () => {
    it('should subscribe to device stateChange events', () => {
      const stateHandler = vi.fn();
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
