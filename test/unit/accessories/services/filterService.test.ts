/**
 * FilterService Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { FilterService } from '../../../../src/accessories/services/filterService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, Logging, PlatformAccessory } from 'homebridge';
import { HapStatusError, createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { emitProductState, setDeviceState } from '../../../helpers/device.js';

// Characteristic types (keyed by UUID in the mock service)
const C = {
  Name: { UUID: 'Name' },
  FilterLifeLevel: { UUID: 'FilterLifeLevel' },
  FilterChangeIndication: { UUID: 'FilterChangeIndication' },
  ConfiguredName: { UUID: 'ConfiguredName' },
};

// Create mock API
function createMockApi() {
  return createMockHapApi(
    { Service: { FilterMaintenance: { UUID: 'FilterMaintenance' } }, Characteristic: C },
    { _mockFilterService: createMockService(100) },
  );
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>, existing = false) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getServiceById: vi.fn(() => (existing ? api._mockFilterService : undefined)),
    addService: vi.fn(() => api._mockFilterService),
    context: {},
  } as unknown as Mocked<PlatformAccessory>;
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

  beforeEach(async () => {
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    mockApi = createMockApi();
    mockAccessory = createMockAccessory(mockApi);
    mockLog = createMockLog();

    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);
    // GET handlers require a connected device
    await device.connect();
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

      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.FilterMaintenance, 'filter-maintenance',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.FilterMaintenance, 'Filter', 'filter-maintenance',
      );
    });

    it('should not overwrite ConfiguredName of an existing service', () => {
      const existingAccessory = createMockAccessory(mockApi, true);
      service = new FilterService({
        accessory: existingAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(existingAccessory.addService).not.toHaveBeenCalled();
      expect(mockApi._mockFilterService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(mockApi._mockFilterService.updateCharacteristic).not.toHaveBeenCalledWith(
        C.ConfiguredName, expect.anything(),
      );
    });

    it('should set configured name', () => {
      service = new FilterService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockFilterService.addOptionalCharacteristic).toHaveBeenCalledWith(
        C.ConfiguredName,
      );
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(
        C.ConfiguredName,
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

    it('should return the cached HomeKit value when filter life is unknown', () => {
      mockApi._mockFilterService._getCharacteristics().get('FilterLifeLevel')!.value = 63;
      setDeviceState(device, { hepaFilterLife: undefined });
      setDeviceState(device, { carbonFilterLife: undefined });
      expect(filterLifeGetHandler()).toBe(63);
    });

    it('should return 100% when filter is new', () => {
      setDeviceState(device, { hepaFilterLife: 100 });
      expect(filterLifeGetHandler()).toBe(100);
    });

    it('should return 50% when filter is half used', () => {
      setDeviceState(device, { hepaFilterLife: 50 });
      expect(filterLifeGetHandler()).toBe(50);
    });

    it('should return 10% when filter is nearly depleted', () => {
      setDeviceState(device, { hepaFilterLife: 10 });
      expect(filterLifeGetHandler()).toBe(10);
    });

    it('should return 0% when filter is depleted', () => {
      setDeviceState(device, { hepaFilterLife: 0 });
      expect(filterLifeGetHandler()).toBe(0);
    });

    it('should use carbon filter as fallback', () => {
      setDeviceState(device, { hepaFilterLife: undefined });
      setDeviceState(device, { carbonFilterLife: 50 });
      expect(filterLifeGetHandler()).toBe(50);
    });

    it('should report the most worn of the HEPA and carbon filters', () => {
      setDeviceState(device, { hepaFilterLife: 80 });
      setDeviceState(device, { carbonFilterLife: 35 });
      expect(filterLifeGetHandler()).toBe(35);

      setDeviceState(device, { hepaFilterLife: 20 });
      setDeviceState(device, { carbonFilterLife: 90 });
      expect(filterLifeGetHandler()).toBe(20);
    });

    it('should ignore an invalid filter value and use the other one', () => {
      setDeviceState(device, { hepaFilterLife: -1 });
      setDeviceState(device, { carbonFilterLife: 40 });
      expect(filterLifeGetHandler()).toBe(40);
    });

    it('should treat negative values as unknown (cached value)', () => {
      mockApi._mockFilterService._getCharacteristics().get('FilterLifeLevel')!.value = 77;
      setDeviceState(device, { hepaFilterLife: -100 });
      expect(filterLifeGetHandler()).toBe(77);
    });

    it('should round and clamp to 100%', () => {
      setDeviceState(device, { hepaFilterLife: 42.6 });
      expect(filterLifeGetHandler()).toBe(43);

      setDeviceState(device, { hepaFilterLife: 150 });
      expect(filterLifeGetHandler()).toBe(100);
    });

    it('should throw HapStatusError when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      setDeviceState(device, { hepaFilterLife: 50 });
      expect(() => filterLifeGetHandler()).toThrow(HapStatusError);
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
      setDeviceState(device, { hepaFilterLife: 100 });
      expect(filterChangeGetHandler()).toBe(0);
    });

    it('should return 0 when filter is at 50%', () => {
      setDeviceState(device, { hepaFilterLife: 50 });
      expect(filterChangeGetHandler()).toBe(0);
    });

    it('should return 0 when filter is at 11%', () => {
      setDeviceState(device, { hepaFilterLife: 11 });
      expect(filterChangeGetHandler()).toBe(0);
    });

    it('should return 1 (change needed) when filter is at 10%', () => {
      setDeviceState(device, { hepaFilterLife: 10 });
      expect(filterChangeGetHandler()).toBe(1);
    });

    it('should return 1 when filter is at 5%', () => {
      setDeviceState(device, { hepaFilterLife: 5 });
      expect(filterChangeGetHandler()).toBe(1);
    });

    it('should return 1 when filter is depleted', () => {
      setDeviceState(device, { hepaFilterLife: 0 });
      expect(filterChangeGetHandler()).toBe(1);
    });

    it('should use the most worn filter', () => {
      setDeviceState(device, { hepaFilterLife: 90 });
      setDeviceState(device, { carbonFilterLife: 8 });
      expect(filterChangeGetHandler()).toBe(1);
    });

    it('should return the cached HomeKit value when filter life is unknown', () => {
      mockApi._mockFilterService._getCharacteristics().get('FilterChangeIndication')!.value = 1;
      setDeviceState(device, { hepaFilterLife: undefined });
      setDeviceState(device, { carbonFilterLife: undefined });
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
      emitProductState(mockMqttClient, { fltf: '0050' });

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterLifeLevel, 50);
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterChangeIndication, 0);
    });

    it('should indicate change needed when filter is low', () => {
      emitProductState(mockMqttClient, { fltf: '0005' });

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterLifeLevel, 5);
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterChangeIndication, 1);
    });

    it('should push the minimum of HEPA and carbon', () => {
      emitProductState(mockMqttClient, { fltf: '0060', cflr: '0025' });

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterLifeLevel, 25);
    });

    it('should not push any update when filter life is unknown', () => {
      setDeviceState(device, { hepaFilterLife: undefined });
      setDeviceState(device, { carbonFilterLife: undefined });
      mockApi._mockFilterService.updateCharacteristic.mockClear();

      service.updateFromState();
      setDeviceState(device, { hepaFilterLife: -1 }, { emit: true });

      expect(mockApi._mockFilterService.updateCharacteristic).not.toHaveBeenCalled();
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

      setDeviceState(device, { hepaFilterLife: 75 });

      mockApi._mockFilterService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterLifeLevel, 75);
      expect(mockApi._mockFilterService.updateCharacteristic).toHaveBeenCalledWith(C.FilterChangeIndication, 0);
    });
  });
});
