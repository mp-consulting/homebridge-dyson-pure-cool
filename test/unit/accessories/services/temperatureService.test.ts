/**
 * TemperatureService Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { TemperatureService } from '../../../../src/accessories/services/temperatureService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, Logging, PlatformAccessory } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { emitSensorData, setDeviceState } from '../../../helpers/device.js';

// Create mock API
function createMockApi() {
  return createMockHapApi(
    {
      Service: { TemperatureSensor: 'TemperatureSensor' },
      Characteristic: { Name: 'Name', CurrentTemperature: 'CurrentTemperature', ConfiguredName: 'ConfiguredName' },
    },
    { _mockTempService: createMockService(0) },
  );
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getServiceById: vi.fn((): unknown => undefined),
    addService: vi.fn(() => api._mockTempService),
    context: {},
  } as unknown as Mocked<PlatformAccessory>;
}

describe('TemperatureService', () => {
  let service: TemperatureService;
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
    it('should get or create TemperatureSensor service', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getServiceById).toHaveBeenCalledWith('TemperatureSensor', 'temperature-sensor');
      expect(mockAccessory.addService).toHaveBeenCalledWith('TemperatureSensor', expect.any(String), 'temperature-sensor');
    });

    it('should not touch ConfiguredName of an existing service', () => {
      mockAccessory.getServiceById.mockReturnValue(mockApi._mockTempService);

      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(service.getService()).toBe(mockApi._mockTempService);
      expect(mockAccessory.addService).not.toHaveBeenCalled();
      expect(mockApi._mockTempService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(mockApi._mockTempService.updateCharacteristic).not.toHaveBeenCalledWith(
        'ConfiguredName',
        expect.anything(),
      );
    });

    it('should set configured name', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockTempService.addOptionalCharacteristic).toHaveBeenCalledWith(
        'ConfiguredName',
      );
      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'ConfiguredName',
        'Temperature',
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
      emitSensorData(mockMqttClient, { tact: '2950' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(21.9, 0.1), // Rounded to 1 decimal
      );
    });

    it('should convert 2731 (Kelvin×10) to ~0°C', () => {
      emitSensorData(mockMqttClient, { tact: '2731' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(0, 0.1),
      );
    });

    it('should not push an update when the temperature becomes unknown', () => {
      emitSensorData(mockMqttClient, { tact: '2950' });
      mockApi._mockTempService.updateCharacteristic.mockClear();

      setDeviceState(device, { temperature: undefined }, { emit: true });

      expect(mockApi._mockTempService.updateCharacteristic).not.toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.anything(),
      );
    });

    it('should not push an update when the temperature is 0 (invalid)', () => {
      emitSensorData(mockMqttClient, { tact: '0000' });

      expect(mockApi._mockTempService.updateCharacteristic).not.toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.anything(),
      );
    });

    it('should only push a value once when it does not change', () => {
      emitSensorData(mockMqttClient, { tact: '2950' });
      emitSensorData(mockMqttClient, { hact: '0040' }); // unrelated change re-emits state

      const calls = mockApi._mockTempService.updateCharacteristic.mock.calls
        .filter((c) => c[0] === 'CurrentTemperature');
      expect(calls).toHaveLength(1);
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
      setDeviceState(device, { temperature: 2932 }); // ~20°C

      mockApi._mockTempService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(20, 0.1),
      );
    });
  });

  describe('handleTemperatureGet (HomeKit GET requests)', () => {
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

    it('should return the cached HomeKit value when temperature is undefined', () => {
      mockApi._mockTempService._getCharacteristics().get('CurrentTemperature')!.value = 18.4;
      const result = temperatureGetHandler();
      expect(result).toBe(18.4);
    });

    it('should throw HapStatusError when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      setDeviceState(device, { temperature: 2950 });

      expect(() => temperatureGetHandler()).toThrow(mockApi.hap.HapStatusError);
      expect(() => temperatureGetHandler()).toThrow(
        expect.objectContaining({ hapStatus: -70402 }) as unknown as Error,
      );
    });

    it('should return converted temperature for valid Kelvin×10 value', () => {
      setDeviceState(device, { temperature: 2950 }); // ~21.85°C
      const result = temperatureGetHandler();
      expect(result).toBeCloseTo(21.9, 1);
    });

    it('should log debug message when GET is called', () => {
      setDeviceState(device, { temperature: 2950 });
      temperatureGetHandler();
      expect(mockLog.debug).toHaveBeenCalledWith('Get Temperature ->', expect.any(Number), '°C');
    });

    it('should return the cached value for zero temperature', () => {
      mockApi._mockTempService._getCharacteristics().get('CurrentTemperature')!.value = 21;
      setDeviceState(device, { temperature: 0 });
      const result = temperatureGetHandler();
      expect(result).toBe(21);
    });

    it('should return the cached value for negative temperature', () => {
      mockApi._mockTempService._getCharacteristics().get('CurrentTemperature')!.value = 21;
      setDeviceState(device, { temperature: -100 });
      const result = temperatureGetHandler();
      expect(result).toBe(21);
    });
  });

  describe('temperatureOffset', () => {
    it('applies a negative offset to a live reading', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        temperatureOffset: -2,
      });

      // 2950 → 21.85°C, then -2 → 19.85 → rounded to 19.9
      emitSensorData(mockMqttClient, { tact: '2950' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(19.9, 0.05),
      );
    });

    it('applies a positive offset to a live reading', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        temperatureOffset: 1.5,
      });

      // 2950 → 21.85°C, then +1.5 → 23.35 → rounded to 23.4
      emitSensorData(mockMqttClient, { tact: '2950' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(23.4, 0.05),
      );
    });

    it('returns the cached value unmodified (no offset) when sensor data is unavailable', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        temperatureOffset: -3,
      });

      const tempChar = mockApi._mockTempService._getCharacteristics().get('CurrentTemperature');
      tempChar!.value = 19;
      const handler = tempChar!.onGet.mock.calls[0][0] as () => number;

      // The cached value already includes the offset; it must not be applied twice
      expect(handler()).toBe(19);
    });

    it('clamps to -40°C when the offset drives the reading below the minimum', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        temperatureOffset: -80,
      });

      // 2731 → ~0°C, then -80 → -80 → clamped to -40
      emitSensorData(mockMqttClient, { tact: '2731' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        -40,
      );
      const handler = mockApi._mockTempService._getCharacteristics()
        .get('CurrentTemperature')!.onGet.mock.calls[0][0] as () => number;
      expect(handler()).toBe(-40);
    });

    it('clamps to 100°C when the offset drives the reading above the maximum', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        temperatureOffset: 90,
      });

      // 2950 → 21.85°C, then +90 → 111.85 → clamped to 100
      emitSensorData(mockMqttClient, { tact: '2950' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        100,
      );
      const handler = mockApi._mockTempService._getCharacteristics()
        .get('CurrentTemperature')!.onGet.mock.calls[0][0] as () => number;
      expect(handler()).toBe(100);
    });

    it('defaults to no offset when not provided', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      emitSensorData(mockMqttClient, { tact: '2950' });

      expect(mockApi._mockTempService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.closeTo(21.9, 0.05),
      );
    });
  });

  describe('useFahrenheit', () => {
    it('logs in °F when enabled', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        useFahrenheit: true,
      });

      const tempChar = mockApi._mockTempService._getCharacteristics().get('CurrentTemperature');
      const handler = tempChar!.onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { temperature: 2950 }); // ~21.85°C ≈ 71.3°F
      handler();

      expect(mockLog.debug).toHaveBeenCalledWith(
        'Get Temperature ->',
        expect.any(Number),
        '°F',
      );
      const fCall = mockLog.debug.mock.calls.find((c) => c[2] === '°F');
      expect(fCall?.[1] as number).toBeCloseTo(71.4, 0.5);
    });

    it('logs in °C by default', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      const tempChar = mockApi._mockTempService._getCharacteristics().get('CurrentTemperature');
      const handler = tempChar!.onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { temperature: 2950 });
      handler();

      expect(mockLog.debug).toHaveBeenCalledWith(
        'Get Temperature ->',
        expect.any(Number),
        '°C',
      );
    });

    it('still returns Celsius from GET when Fahrenheit logging is enabled (HomeKit is always °C)', () => {
      service = new TemperatureService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        useFahrenheit: true,
      });

      const tempChar = mockApi._mockTempService._getCharacteristics().get('CurrentTemperature');
      const handler = tempChar!.onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { temperature: 2950 });
      const result = handler();
      expect(result).toBeCloseTo(21.9, 0.05);
    });
  });
});
