/**
 * HumidityService Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { HumidityService } from '../../../../src/accessories/services/humidityService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, Logging, PlatformAccessory } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { emitSensorData, setDeviceState } from '../../../helpers/device.js';

// Create mock API
function createMockApi() {
  return createMockHapApi(
    {
      Service: { HumiditySensor: 'HumiditySensor' },
      Characteristic: { Name: 'Name', CurrentRelativeHumidity: 'CurrentRelativeHumidity', ConfiguredName: 'ConfiguredName' },
    },
    { _mockHumidityService: createMockService(0) },
  );
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getServiceById: vi.fn((): unknown => undefined),
    addService: vi.fn(() => api._mockHumidityService),
    context: {},
  } as unknown as Mocked<PlatformAccessory>;
}

describe('HumidityService', () => {
  let service: HumidityService;
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
    // GET handlers report "Not Responding" unless the device is connected
    await device.connect();
  });

  afterEach(async () => {
    service?.destroy();
    await device.disconnect();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should get or create HumiditySensor service', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getServiceById).toHaveBeenCalledWith('HumiditySensor', 'humidity-sensor');
      expect(mockAccessory.addService).toHaveBeenCalledWith('HumiditySensor', expect.any(String), 'humidity-sensor');
    });

    it('should not touch ConfiguredName of an existing service', () => {
      mockAccessory.getServiceById.mockReturnValue(mockApi._mockHumidityService);

      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockHumidityService);
      expect(mockAccessory.addService).not.toHaveBeenCalled();
      expect(mockApi._mockHumidityService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(mockApi._mockHumidityService.updateCharacteristic).not.toHaveBeenCalledWith(
        'ConfiguredName',
        expect.anything(),
      );
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
      emitSensorData(mockMqttClient, { hact: '0045' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        45,
      );
    });

    it('should report 0% humidity', () => {
      emitSensorData(mockMqttClient, { hact: '0000' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        0,
      );
    });

    it('should report 100% humidity', () => {
      emitSensorData(mockMqttClient, { hact: '0100' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        100,
      );
    });

    it('should not push an update when humidity becomes unknown', () => {
      emitSensorData(mockMqttClient, { hact: '0045' });
      mockApi._mockHumidityService.updateCharacteristic.mockClear();

      setDeviceState(device, { humidity: undefined }, { emit: true });

      expect(mockApi._mockHumidityService.updateCharacteristic).not.toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        expect.anything(),
      );
    });

    it('should not push an update when humidity is out of range (negative)', () => {
      emitSensorData(mockMqttClient, { hact: '-5' });

      expect(mockApi._mockHumidityService.updateCharacteristic).not.toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        expect.anything(),
      );
    });

    it('should not push an update when humidity is out of range (>100)', () => {
      emitSensorData(mockMqttClient, { hact: '0150' });

      expect(mockApi._mockHumidityService.updateCharacteristic).not.toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        expect.anything(),
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
      setDeviceState(device, { humidity: 65 });

      mockApi._mockHumidityService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        65,
      );
    });
  });

  describe('handleHumidityGet (HomeKit GET requests)', () => {
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

    it('should return the cached HomeKit value when humidity is undefined', () => {
      mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity')!.value = 42;
      const result = humidityGetHandler();
      expect(result).toBe(42);
    });

    it('should throw HapStatusError when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      setDeviceState(device, { humidity: 45 });

      expect(() => humidityGetHandler()).toThrow(
        expect.objectContaining({ hapStatus: -70402 }) as unknown as Error,
      );
    });

    it('should return humidity value directly', () => {
      setDeviceState(device, { humidity: 45 });
      const result = humidityGetHandler();
      expect(result).toBe(45);
    });

    it('should log debug message when GET is called', () => {
      setDeviceState(device, { humidity: 60 });
      humidityGetHandler();
      expect(mockLog.debug).toHaveBeenCalledWith('Get Humidity ->', 60, '%');
    });

    it('should return the cached value for negative humidity', () => {
      mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity')!.value = 42;
      setDeviceState(device, { humidity: -10 });
      const result = humidityGetHandler();
      expect(result).toBe(42);
    });

    it('should return the cached value for humidity > 100', () => {
      mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity')!.value = 42;
      setDeviceState(device, { humidity: 150 });
      const result = humidityGetHandler();
      expect(result).toBe(42);
    });

    it('should return 0% for zero humidity (valid)', () => {
      setDeviceState(device, { humidity: 0 });
      const result = humidityGetHandler();
      expect(result).toBe(0);
    });

    it('should return 100% for 100 humidity (valid)', () => {
      setDeviceState(device, { humidity: 100 });
      const result = humidityGetHandler();
      expect(result).toBe(100);
    });
  });

  describe('humidityOffset', () => {
    it('applies a negative offset to a live reading', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        humidityOffset: -5,
      });

      emitSensorData(mockMqttClient, { hact: '0050' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        45,
      );
    });

    it('applies a positive offset to a live reading', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        humidityOffset: 5,
      });

      emitSensorData(mockMqttClient, { hact: '0060' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        65,
      );
    });

    it('clamps to 0% when offset drives the reading below the minimum', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        humidityOffset: -20,
      });

      emitSensorData(mockMqttClient, { hact: '0010' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        0,
      );
    });

    it('clamps to 100% when offset drives the reading above the maximum', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        humidityOffset: 20,
      });

      emitSensorData(mockMqttClient, { hact: '0095' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        100,
      );
    });

    it('returns the cached value unmodified (no offset) when sensor data is unavailable', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        humidityOffset: -10,
      });

      const humidityChar = mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity');
      humidityChar!.value = 37;
      const handler = humidityChar!.onGet.mock.calls[0][0] as () => number;

      // The cached value already includes the offset; it must not be applied twice
      expect(handler()).toBe(37);
    });

    it('clamps the GET result to 0-100 after applying the offset', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        humidityOffset: 20,
      });

      const humidityChar = mockApi._mockHumidityService._getCharacteristics().get('CurrentRelativeHumidity');
      const handler = humidityChar!.onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { humidity: 95 });
      expect(handler()).toBe(100);
    });

    it('defaults to no offset when not provided', () => {
      service = new HumidityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      emitSensorData(mockMqttClient, { hact: '0050' });

      expect(mockApi._mockHumidityService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentRelativeHumidity',
        50,
      );
    });
  });
});
