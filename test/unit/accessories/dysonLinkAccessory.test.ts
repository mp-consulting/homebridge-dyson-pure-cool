/**
 * DysonLinkAccessory Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DysonLinkAccessory } from '../../../src/accessories/dysonLinkAccessory.js';
import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../src/devices/index.js';
import type { DysonMqttClient } from '../../../src/protocol/mqttClient.js';
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
  const mockFanService = createMockService();
  const mockInfoService = createMockService();
  const mockTempService = createMockService();
  const mockHumidityService = createMockService();

  return {
    hap: {
      Service: {
        Fanv2: 'Fanv2',
        AccessoryInformation: 'AccessoryInformation',
        TemperatureSensor: 'TemperatureSensor',
        HumiditySensor: 'HumiditySensor',
        Switch: 'Switch',
        AirQualitySensor: 'AirQualitySensor',
        FilterMaintenance: 'FilterMaintenance',
        Thermostat: 'Thermostat',
        HumidifierDehumidifier: 'HumidifierDehumidifier',
        HeaterCooler: 'HeaterCooler',
      },
      Characteristic: {
        Name: 'Name',
        Active: 'Active',
        RotationSpeed: 'RotationSpeed',
        SwingMode: 'SwingMode',
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
        FirmwareRevision: 'FirmwareRevision',
        CurrentTemperature: 'CurrentTemperature',
        CurrentRelativeHumidity: 'CurrentRelativeHumidity',
        On: 'On',
        AirQuality: 'AirQuality',
        PM2_5Density: 'PM2_5Density',
        PM10Density: 'PM10Density',
        VOCDensity: 'VOCDensity',
        NitrogenDioxideDensity: 'NitrogenDioxideDensity',
        FilterLifeLevel: 'FilterLifeLevel',
        FilterChangeIndication: 'FilterChangeIndication',
        CurrentHeatingCoolingState: 'CurrentHeatingCoolingState',
        TargetHeatingCoolingState: 'TargetHeatingCoolingState',
        TargetTemperature: 'TargetTemperature',
        TemperatureDisplayUnits: 'TemperatureDisplayUnits',
        CurrentHumidifierDehumidifierState: 'CurrentHumidifierDehumidifierState',
        TargetHumidifierDehumidifierState: 'TargetHumidifierDehumidifierState',
        RelativeHumidityHumidifierThreshold: 'RelativeHumidityHumidifierThreshold',
        WaterLevel: 'WaterLevel',
        TargetFanState: 'TargetFanState',
        CurrentFanState: 'CurrentFanState',
        CurrentHeaterCoolerState: 'CurrentHeaterCoolerState',
        TargetHeaterCoolerState: 'TargetHeaterCoolerState',
        HeatingThresholdTemperature: 'HeatingThresholdTemperature',
      },
    },
    _mockFanService: mockFanService,
    _mockInfoService: mockInfoService,
    _mockTempService: mockTempService,
    _mockHumidityService: mockHumidityService,
  } as unknown as jest.Mocked<API> & {
    _mockFanService: ReturnType<typeof createMockService>;
    _mockInfoService: ReturnType<typeof createMockService>;
    _mockTempService: ReturnType<typeof createMockService>;
    _mockHumidityService: ReturnType<typeof createMockService>;
  };
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'Fanv2') {
        return api._mockFanService;
      }
      if (serviceType === 'AccessoryInformation') {
        return api._mockInfoService;
      }
      if (serviceType === 'TemperatureSensor') {
        return api._mockTempService;
      }
      if (serviceType === 'HumiditySensor') {
        return api._mockHumidityService;
      }
      return undefined;
    }),
    getServiceById: jest.fn(() => undefined),
    addService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'Fanv2') {
        return api._mockFanService;
      }
      if (serviceType === 'TemperatureSensor') {
        return api._mockTempService;
      }
      if (serviceType === 'HumiditySensor') {
        return api._mockHumidityService;
      }
      return createMockService();
    }),
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

describe('DysonLinkAccessory', () => {
  let accessory: DysonLinkAccessory;
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

  describe('constructor', () => {
    it('should create accessory with FanService', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(accessory).toBeDefined();
      // FanService should be created during setupServices()
      expect(accessory.getFanService()).toBeDefined();
    });

    it('should set up AccessoryInformation service', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockAccessory.getService).toHaveBeenCalledWith('AccessoryInformation');
      expect(mockApi._mockInfoService.setCharacteristic).toHaveBeenCalledWith('Manufacturer', 'Dyson');
    });

    it('should log initialization', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockLog.debug).toHaveBeenCalledWith('DysonAccessory initialized for', 'Test Dyson');
    });
  });

  describe('getters', () => {
    beforeEach(() => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should return the accessory', () => {
      expect(accessory.getAccessory()).toBe(mockAccessory);
    });

    it('should return the device', () => {
      expect(accessory.getDevice()).toBe(device);
    });

    it('should return the FanService', () => {
      expect(accessory.getFanService()).toBeDefined();
    });
  });

  describe('device events', () => {
    beforeEach(() => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should log on device connect', async () => {
      await device.connect();

      // DysonLinkAccessory.handleConnect logs reconnection message
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('reconnected'),
      );
    });

    it('should log on device disconnect', async () => {
      await device.connect();
      await device.disconnect();

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('disconnected'),
        expect.any(String),
      );
    });

    it('should sync state on reconnect', async () => {
      await device.connect();

      // Clear previous calls
      mockLog.info.mockClear();

      // Simulate reconnection event
      mockMqttClient._emit('connect');

      // Should log reconnection with state sync
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('reconnected'),
      );
    });
  });

  describe('HP02 support (455)', () => {
    it('should work with HP02 device', () => {
      const hp02Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '455' },
        mockMqttClientFactory,
      );

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device: hp02Device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(accessory).toBeDefined();
      expect(accessory.getDevice().productType).toBe('455');
    });
  });

  describe('TP07 support (438E)', () => {
    it('should work with TP07 device', () => {
      const tp07Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '438E' },
        mockMqttClientFactory,
      );

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device: tp07Device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(accessory).toBeDefined();
      expect(accessory.getDevice().productType).toBe('438E');
    });
  });

  describe('sensor service getters', () => {
    beforeEach(() => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });
    });

    it('should return TemperatureService when device supports it', () => {
      // TP04 (438) supports temperature sensor
      const tempService = accessory.getTemperatureService();
      expect(tempService).toBeDefined();
    });

    it('should return HumidityService when device supports it', () => {
      // TP04 (438) supports humidity sensor
      const humidityService = accessory.getHumidityService();
      expect(humidityService).toBeDefined();
    });
  });

  describe('handleDisconnect', () => {
    it('should log warning when device disconnects', async () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      await device.connect();
      mockLog.warn.mockClear();

      // Simulate disconnect
      await device.disconnect();

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Device disconnected'),
        expect.any(String),
      );
    });
  });

  describe('handleConnect', () => {
    it('should sync state and log reconnection', async () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      await device.connect();
      mockLog.info.mockClear();

      // Simulate reconnect event
      mockMqttClient._emit('connect');

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('reconnected'),
      );
    });
  });

  describe('options propagation to setupServices', () => {
    it('should disable temperature sensor when isTemperatureIgnored is true', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isTemperatureIgnored: true },
      });

      // TP04 (438) normally has temperature sensor, but it should be disabled
      expect(accessory.getTemperatureService()).toBeUndefined();
    });

    it('should disable humidity sensor when isHumidityIgnored is true', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isHumidityIgnored: true },
      });

      expect(accessory.getHumidityService()).toBeUndefined();
    });

    it('should disable night mode when isNightModeEnabled is false', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isNightModeEnabled: false },
      });

      expect(accessory.getNightModeService()).toBeUndefined();
    });

    it('should enable continuous monitoring when isContinuousMonitoringEnabled is true', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isContinuousMonitoringEnabled: true },
      });

      expect(accessory.getContinuousMonitoringService()).toBeDefined();
    });

    it('should disable jet focus when isJetFocusEnabled is false', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isJetFocusEnabled: false },
      });

      expect(accessory.getJetFocusService()).toBeUndefined();
    });

    it('should create heater-cooler service when heatingServiceType is heater-cooler', () => {
      // Use HP04 (527) which supports heating
      const hp04Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '527' },
        mockMqttClientFactory,
      );

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device: hp04Device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { heatingServiceType: 'heater-cooler' },
      });

      expect(accessory.getHeaterCoolerService()).toBeDefined();
      expect(accessory.getThermostatService()).toBeUndefined();
    });

    it('should disable heating when isHeatingDisabled is true', () => {
      const hp04Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '527' },
        mockMqttClientFactory,
      );

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device: hp04Device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isHeatingDisabled: true },
      });

      expect(accessory.getThermostatService()).toBeUndefined();
      expect(accessory.getHeaterCoolerService()).toBeUndefined();
    });

    it('should create both heating services when heatingServiceType is both', () => {
      const hp04Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '527' },
        mockMqttClientFactory,
      );

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device: hp04Device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { heatingServiceType: 'both' },
      });

      expect(accessory.getThermostatService()).toBeDefined();
      expect(accessory.getHeaterCoolerService()).toBeDefined();
    });

    it('should pass options correctly when set before super() call', () => {
      // This test verifies the fix for the constructor ordering bug.
      // Previously, options were set AFTER super() which meant setupServices()
      // would see an empty options object.
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: {
          isTemperatureIgnored: true,
          isHumidityIgnored: true,
          isNightModeEnabled: false,
          isJetFocusEnabled: false,
        },
      });

      // All of these should be disabled because options were passed
      expect(accessory.getTemperatureService()).toBeUndefined();
      expect(accessory.getHumidityService()).toBeUndefined();
      expect(accessory.getNightModeService()).toBeUndefined();
      expect(accessory.getJetFocusService()).toBeUndefined();

      // Fan service should always be present
      expect(accessory.getFanService()).toBeDefined();
    });
  });
});
