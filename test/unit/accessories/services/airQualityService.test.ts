/**
 * AirQualityService Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { AirQualityService } from '../../../../src/accessories/services/airQualityService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { API, Logging, PlatformAccessory, Service } from 'homebridge';
import { HapStatusError, createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../../helpers/mocks.js';
import { emitSensorData, setDeviceState } from '../../../helpers/device.js';

// Characteristic types (keyed by UUID in the mock service)
const C = {
  Name: { UUID: 'Name' },
  AirQuality: { UUID: 'AirQuality' },
  PM2_5Density: { UUID: 'PM2_5Density' },
  PM10Density: { UUID: 'PM10Density' },
  VOCDensity: { UUID: 'VOCDensity' },
  NitrogenDioxideDensity: { UUID: 'NitrogenDioxideDensity' },
  ConfiguredName: { UUID: 'ConfiguredName' },
};

// Create mock API
function createMockApi() {
  return createMockHapApi(
    { Service: { AirQualitySensor: { UUID: 'AirQualitySensor' } }, Characteristic: C },
    { _mockAirQualityService: createMockService(0) },
  );
}

// Create mock accessory (existing = the service is already cached)
function createMockAccessory(api: ReturnType<typeof createMockApi>, existing = false) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getServiceById: vi.fn(() => (existing ? api._mockAirQualityService : undefined)),
    addService: vi.fn(() => api._mockAirQualityService),
    context: {},
  } as unknown as Mocked<PlatformAccessory>;
}


describe('AirQualityService', () => {
  let service: AirQualityService;
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
    it('should get or create AirQualitySensor service', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.AirQualitySensor, 'air-quality-sensor',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.AirQualitySensor, 'Air Quality', 'air-quality-sensor',
      );
    });

    it('should not overwrite ConfiguredName of an existing service', () => {
      const existingAccessory = createMockAccessory(mockApi, true);
      service = new AirQualityService({
        accessory: existingAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(existingAccessory.addService).not.toHaveBeenCalled();
      expect(mockApi._mockAirQualityService.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(mockApi._mockAirQualityService.updateCharacteristic).not.toHaveBeenCalledWith(
        C.ConfiguredName, expect.anything(),
      );
    });

    it('should link to the primary service', () => {
      const primaryService = { addLinkedService: vi.fn() } as unknown as Service;
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        primaryService,
      });

      expect(primaryService.addLinkedService).toHaveBeenCalledWith(mockApi._mockAirQualityService);
    });

    it('should set configured name', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockAirQualityService.addOptionalCharacteristic).toHaveBeenCalledWith(
        C.ConfiguredName,
      );
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(
        C.ConfiguredName,
        'Air Quality',
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
      setDeviceState(device, { pm25: undefined });
      expect(airQualityGetHandler()).toBe(0);
    });

    it('should return UNKNOWN (0) when PM2.5 is negative', () => {
      setDeviceState(device, { pm25: -1 });
      expect(airQualityGetHandler()).toBe(0);
    });

    it('should return EXCELLENT (1) for PM2.5 0-12', () => {
      setDeviceState(device, { pm25: 0 });
      expect(airQualityGetHandler()).toBe(1);

      setDeviceState(device, { pm25: 12 });
      expect(airQualityGetHandler()).toBe(1);
    });

    it('should return GOOD (2) for PM2.5 13-35', () => {
      setDeviceState(device, { pm25: 13 });
      expect(airQualityGetHandler()).toBe(2);

      setDeviceState(device, { pm25: 35 });
      expect(airQualityGetHandler()).toBe(2);
    });

    it('should return FAIR (3) for PM2.5 36-55', () => {
      setDeviceState(device, { pm25: 36 });
      expect(airQualityGetHandler()).toBe(3);

      setDeviceState(device, { pm25: 55 });
      expect(airQualityGetHandler()).toBe(3);
    });

    it('should return INFERIOR (4) for PM2.5 56-150', () => {
      setDeviceState(device, { pm25: 56 });
      expect(airQualityGetHandler()).toBe(4);

      setDeviceState(device, { pm25: 150 });
      expect(airQualityGetHandler()).toBe(4);
    });

    it('should return POOR (5) for PM2.5 > 150', () => {
      setDeviceState(device, { pm25: 151 });
      expect(airQualityGetHandler()).toBe(5);

      setDeviceState(device, { pm25: 500 });
      expect(airQualityGetHandler()).toBe(5);
    });

    it('should return UNKNOWN (0) when there are no valid readings at all', () => {
      setDeviceState(device, { pm25: undefined });
      setDeviceState(device, { pm10: -1 });
      setDeviceState(device, { vocIndex: undefined });
      setDeviceState(device, { no2Index: undefined });
      expect(airQualityGetHandler()).toBe(0);
    });

    it('should rate PM10 alone when PM2.5 is missing', () => {
      setDeviceState(device, { pm25: undefined });
      setDeviceState(device, { pm10: 54 });
      expect(airQualityGetHandler()).toBe(1);
      setDeviceState(device, { pm10: 55 });
      expect(airQualityGetHandler()).toBe(2);
      setDeviceState(device, { pm10: 355 });
      expect(airQualityGetHandler()).toBe(5);
    });

    it('should take the worst of PM2.5 and PM10', () => {
      setDeviceState(device, { pm25: 5 }); // EXCELLENT
      setDeviceState(device, { pm10: 200 }); // FAIR
      expect(airQualityGetHandler()).toBe(3);

      setDeviceState(device, { pm25: 100 }); // INFERIOR
      setDeviceState(device, { pm10: 10 }); // EXCELLENT
      expect(airQualityGetHandler()).toBe(4);
    });

    it('should take the worst including the VOC index (va10 / 10)', () => {
      setDeviceState(device, { pm25: 5 }); // EXCELLENT
      setDeviceState(device, { pm10: 10 }); // EXCELLENT
      setDeviceState(device, { vocIndex: 70 }); // index 7 -> INFERIOR
      expect(airQualityGetHandler()).toBe(4);

      setDeviceState(device, { vocIndex: 20 }); // index 2 -> GOOD
      expect(airQualityGetHandler()).toBe(2);

      setDeviceState(device, { vocIndex: 90 }); // index 9 -> POOR
      expect(airQualityGetHandler()).toBe(5);
    });

    it('should ignore NO2 when the device has no NO2 sensor', () => {
      setDeviceState(device, { pm25: 5 });
      setDeviceState(device, { no2Index: 90 });
      expect(airQualityGetHandler()).toBe(1);
    });

    it('should throw HapStatusError when the device is disconnected', () => {
      mockMqttClient.isConnected.mockReturnValue(false);
      expect(() => airQualityGetHandler()).toThrow(HapStatusError);
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

    it('should return the cached HomeKit value when PM2.5 is undefined', () => {
      mockApi._mockAirQualityService._getCharacteristics().get('PM2_5Density')!.value = 17;
      setDeviceState(device, { pm25: undefined });
      expect(pm25GetHandler()).toBe(17);
    });

    it('should return PM2.5 value directly', () => {
      setDeviceState(device, { pm25: 42 });
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

    it('should return the cached HomeKit value when PM10 is undefined', () => {
      mockApi._mockAirQualityService._getCharacteristics().get('PM10Density')!.value = 23;
      setDeviceState(device, { pm10: undefined });
      expect(pm10GetHandler()).toBe(23);
    });

    it('should return PM10 value directly', () => {
      setDeviceState(device, { pm10: 85 });
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

    it('should return the cached HomeKit value when VOC is undefined', () => {
      mockApi._mockAirQualityService._getCharacteristics().get('VOCDensity')!.value = 4;
      setDeviceState(device, { vocIndex: undefined });
      expect(vocGetHandler()).toBe(4);
    });

    it('should return VOC index value directly', () => {
      setDeviceState(device, { vocIndex: 3 });
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
      emitSensorData(mockMqttClient, { p25r: '0025', p10r: '0050', va10: '0002' });

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.AirQuality, 2);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.PM2_5Density, 25);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.PM10Density, 50);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.VOCDensity, 2);
    });

    it('should report UNKNOWN and skip densities when readings are undefined', () => {
      setDeviceState(device, { pm25: undefined });
      setDeviceState(device, { pm10: undefined });
      setDeviceState(device, { vocIndex: undefined });
      mockApi._mockAirQualityService.updateCharacteristic.mockClear();

      service.updateFromState();

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.AirQuality, 0);
      expect(mockApi._mockAirQualityService.updateCharacteristic).not.toHaveBeenCalledWith(C.PM2_5Density, expect.anything());
      expect(mockApi._mockAirQualityService.updateCharacteristic).not.toHaveBeenCalledWith(C.PM10Density, expect.anything());
      expect(mockApi._mockAirQualityService.updateCharacteristic).not.toHaveBeenCalledWith(C.VOCDensity, expect.anything());
    });

    it('should not push unchanged values again', () => {
      emitSensorData(mockMqttClient, { p25r: '0025', p10r: '0050', va10: '0002' });
      mockApi._mockAirQualityService.updateCharacteristic.mockClear();

      emitSensorData(mockMqttClient, { p10r: '0060' });

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledTimes(1);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.PM10Density, 60);
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

      setDeviceState(device, { pm25: 10 });
      setDeviceState(device, { pm10: 20 });
      setDeviceState(device, { vocIndex: 1 });

      mockApi._mockAirQualityService.updateCharacteristic.mockClear();
      service.updateFromState();

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.AirQuality, 1);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.PM2_5Density, 10);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.PM10Density, 20);
      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.VOCDensity, 1);
    });
  });

  describe('NO2 sensor support', () => {
    it('should register NO2 characteristic when hasNo2Sensor is true', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        hasNo2Sensor: true,
      });

      const chars = mockApi._mockAirQualityService._getCharacteristics();
      expect(chars.get('NitrogenDioxideDensity')?.onGet).toHaveBeenCalled();
    });

    it('should not register NO2 characteristic when hasNo2Sensor is false', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        hasNo2Sensor: false,
      });

      const chars = mockApi._mockAirQualityService._getCharacteristics();
      // NO2 characteristic should not have onGet called
      expect(chars.has('NitrogenDioxideDensity')).toBe(false);
    });

    it('should return NO2 index value', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        hasNo2Sensor: true,
      });

      const no2Char = mockApi._mockAirQualityService._getCharacteristics().get('NitrogenDioxideDensity');
      const no2GetHandler = no2Char!.onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { no2Index: 5 });
      expect(no2GetHandler()).toBe(5);
    });

    it('should return the cached HomeKit value when NO2 index is undefined', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        hasNo2Sensor: true,
      });

      const no2Char = mockApi._mockAirQualityService._getCharacteristics().get('NitrogenDioxideDensity');
      const no2GetHandler = no2Char!.onGet.mock.calls[0][0] as () => number;

      mockApi._mockAirQualityService._getCharacteristics().get('NitrogenDioxideDensity')!.value = 2;
      setDeviceState(device, { no2Index: undefined });
      expect(no2GetHandler()).toBe(2);
    });

    it('should include NO2 (noxl / 10) in the worst-of AirQuality', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        hasNo2Sensor: true,
      });

      const airQualityChar = mockApi._mockAirQualityService._getCharacteristics().get('AirQuality');
      const airQualityGetHandler = airQualityChar!.onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { pm25: 5 }); // EXCELLENT
      setDeviceState(device, { pm10: 10 }); // EXCELLENT
      setDeviceState(device, { vocIndex: 10 }); // index 1 -> EXCELLENT
      setDeviceState(device, { no2Index: 50 }); // index 5 -> FAIR
      expect(airQualityGetHandler()).toBe(3);

      // NO2 alone is enough for a rating
      setDeviceState(device, { pm25: undefined });
      setDeviceState(device, { pm10: undefined });
      setDeviceState(device, { vocIndex: undefined });
      setDeviceState(device, { no2Index: 85 }); // index 8.5 -> POOR
      expect(airQualityGetHandler()).toBe(5);
    });

    it('should update NO2 characteristic on state change', () => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        hasNo2Sensor: true,
      });

      mockApi._mockAirQualityService.updateCharacteristic.mockClear();

      emitSensorData(mockMqttClient, { noxl: '0007' });

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.NitrogenDioxideDensity, 7);
    });
  });

  describe('basic air quality sensor characteristics', () => {
    it('should not expose PM2.5/PM10 and remove them from a cached service', () => {
      const cached = mockApi._mockAirQualityService;
      const pm25 = { UUID: 'PM2_5Density' };
      const pm10 = { UUID: 'PM10Density' };
      const airQuality = { UUID: 'AirQuality' };
      (cached as unknown as { characteristics: { UUID: string }[] }).characteristics = [airQuality, pm25, pm10];
      const existingAccessory = createMockAccessory(mockApi, true);

      new AirQualityService({
        accessory: existingAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        basicAirQualitySensor: true,
      });

      expect(cached.removeCharacteristic).toHaveBeenCalledTimes(2);
      expect(cached.removeCharacteristic).toHaveBeenCalledWith(pm25);
      expect(cached.removeCharacteristic).toHaveBeenCalledWith(pm10);
      expect(cached._getCharacteristics().has('PM2_5Density')).toBe(false);
      expect(cached._getCharacteristics().has('PM10Density')).toBe(false);
    });

    it('should not push PM2.5/PM10 densities on state change', () => {
      new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        basicAirQualitySensor: true,
      });

      emitSensorData(mockMqttClient, { p25r: '0003', p10r: '0004' });

      expect(mockApi._mockAirQualityService.updateCharacteristic).toHaveBeenCalledWith(C.AirQuality, 2);
      expect(mockApi._mockAirQualityService.updateCharacteristic).not.toHaveBeenCalledWith(C.PM2_5Density, expect.anything());
      expect(mockApi._mockAirQualityService.updateCharacteristic).not.toHaveBeenCalledWith(C.PM10Density, expect.anything());
    });

    it('should return UNKNOWN (0) when pact is missing', () => {
      new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        basicAirQualitySensor: true,
      });
      const handler = mockApi._mockAirQualityService._getCharacteristics().get('AirQuality')!
        .onGet.mock.calls[0][0] as () => number;

      setDeviceState(device, { pm25: undefined });
      setDeviceState(device, { vocIndex: 80 });
      expect(handler()).toBe(0);
    });
  });

  describe('basic air quality sensor (Link series)', () => {
    let airQualityGetHandler: () => number;

    beforeEach(() => {
      service = new AirQualityService({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        basicAirQualitySensor: true,
      });

      const airQualityChar = mockApi._mockAirQualityService._getCharacteristics().get('AirQuality');
      airQualityGetHandler = airQualityChar!.onGet.mock.calls[0][0] as () => number;
    });

    describe('pact (particulate) index calculation', () => {
      it('should return EXCELLENT (1) for pact 0-2', () => {
        setDeviceState(device, { pm25: 0 });
        expect(airQualityGetHandler()).toBe(1);

        setDeviceState(device, { pm25: 2 });
        expect(airQualityGetHandler()).toBe(1);
      });

      it('should return GOOD (2) for pact 3-4', () => {
        setDeviceState(device, { pm25: 3 });
        expect(airQualityGetHandler()).toBe(2);

        setDeviceState(device, { pm25: 4 });
        expect(airQualityGetHandler()).toBe(2);
      });

      it('should return FAIR (3) for pact 5-7', () => {
        setDeviceState(device, { pm25: 5 });
        expect(airQualityGetHandler()).toBe(3);

        setDeviceState(device, { pm25: 7 });
        expect(airQualityGetHandler()).toBe(3);
      });

      it('should return INFERIOR (4) for pact 8-9', () => {
        setDeviceState(device, { pm25: 8 });
        expect(airQualityGetHandler()).toBe(4);

        setDeviceState(device, { pm25: 9 });
        expect(airQualityGetHandler()).toBe(4);
      });

      it('should return POOR (5) for pact > 9', () => {
        setDeviceState(device, { pm25: 10 });
        expect(airQualityGetHandler()).toBe(5);
      });
    });

    describe('vact (VOC) index calculation', () => {
      it('should return EXCELLENT (1) for vact scaled 0-3', () => {
        // scaled = vact * 0.125, so vact <= 24 gives scaled <= 3
        setDeviceState(device, { pm25: 0 }); // Good pact
        setDeviceState(device, { vocIndex: 0 });
        expect(airQualityGetHandler()).toBe(1);

        setDeviceState(device, { vocIndex: 24 });
        expect(airQualityGetHandler()).toBe(1);
      });

      it('should return GOOD (2) for vact scaled 3-6', () => {
        // scaled = vact * 0.125, so vact 25-48 gives scaled ~3.125-6
        setDeviceState(device, { pm25: 0 }); // Good pact
        setDeviceState(device, { vocIndex: 32 }); // scaled = 4
        expect(airQualityGetHandler()).toBe(2);

        setDeviceState(device, { vocIndex: 48 }); // scaled = 6
        expect(airQualityGetHandler()).toBe(2);
      });

      it('should return FAIR (3) for vact scaled 6-8', () => {
        // scaled = vact * 0.125, so vact 49-64 gives scaled ~6.125-8
        setDeviceState(device, { pm25: 0 }); // Good pact
        setDeviceState(device, { vocIndex: 56 }); // scaled = 7
        expect(airQualityGetHandler()).toBe(3);

        setDeviceState(device, { vocIndex: 64 }); // scaled = 8
        expect(airQualityGetHandler()).toBe(3);
      });

      it('should return INFERIOR (4) for vact scaled 8-9', () => {
        // scaled = vact * 0.125, so vact 65-72 gives scaled ~8.125-9
        setDeviceState(device, { pm25: 0 }); // Good pact
        setDeviceState(device, { vocIndex: 68 }); // scaled = 8.5
        expect(airQualityGetHandler()).toBe(4);

        setDeviceState(device, { vocIndex: 72 }); // scaled = 9
        expect(airQualityGetHandler()).toBe(4);
      });

      it('should return POOR (5) for vact scaled > 9', () => {
        // scaled = vact * 0.125, so vact > 72 gives scaled > 9
        setDeviceState(device, { pm25: 0 }); // Good pact
        setDeviceState(device, { vocIndex: 80 }); // scaled = 10
        expect(airQualityGetHandler()).toBe(5);
      });
    });

    describe('combined pact and vact quality', () => {
      it('should return worse of pact and vact quality', () => {
        // Bad pact (5), good vact - should return bad pact
        setDeviceState(device, { pm25: 5 }); // FAIR (3)
        setDeviceState(device, { vocIndex: 0 }); // EXCELLENT (1)
        expect(airQualityGetHandler()).toBe(3);

        // Good pact (0), bad vact - should return bad vact
        setDeviceState(device, { pm25: 0 }); // EXCELLENT (1)
        setDeviceState(device, { vocIndex: 80 }); // POOR (5)
        expect(airQualityGetHandler()).toBe(5);
      });

      it('should use vact quality of 1 when vocIndex is undefined', () => {
        setDeviceState(device, { pm25: 5 }); // FAIR (3)
        setDeviceState(device, { vocIndex: undefined });
        expect(airQualityGetHandler()).toBe(3); // Should only use pact
      });
    });
  });
});
