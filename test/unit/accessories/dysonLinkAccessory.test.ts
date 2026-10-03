/**
 * DysonLinkAccessory Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { DysonLinkAccessory } from '../../../src/accessories/dysonLinkAccessory.js';
import { BaseService } from '../../../src/accessories/services/baseService.js';
import { DysonLinkDevice } from '../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../src/devices/index.js';
import type { API, Logging, PlatformAccessory, Service } from 'homebridge';
import { createMockHapApi, createMockLog, createMockMqttClient, createMockService } from '../../helpers/mocks.js';

function createCharacteristicProxy(): Record<string, { UUID: string }> {
  const cache = new Map<string, { UUID: string }>();
  return new Proxy({}, {
    get: (_target, prop) => {
      const name = String(prop);
      if (!cache.has(name)) {
        cache.set(name, { UUID: `${name}-uuid` });
      }
      return cache.get(name);
    },
  });
}

// Create mock API
function createMockApi() {
  return createMockHapApi(
    {
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
      // Any characteristic name resolves to a stable { UUID } object
      Characteristic: createCharacteristicProxy(),
    },
    {
      _mockFanService: createMockService(0),
      _mockInfoService: createMockService(0),
      _mockTempService: createMockService(0),
      _mockHumidityService: createMockService(0),
    },
  );
}

// Create mock accessory
function createMockAccessory(api: ReturnType<typeof createMockApi>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: vi.fn((serviceType: unknown) => {
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
    getServiceById: vi.fn(() => undefined),
    addService: vi.fn((serviceType: unknown) => {
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
    services: [] as Service[],
    removeService: vi.fn(),
    context: {},
  } as unknown as Mocked<PlatformAccessory>;
}

describe('DysonLinkAccessory', () => {
  let accessory: DysonLinkAccessory;
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
      expect(mockApi._mockInfoService.setCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.Manufacturer, 'Dyson');
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
      // The extra "HomeKit will show Not Responding" warning was dropped
      expect(mockLog.warn).not.toHaveBeenCalledWith(expect.stringContaining('Not Responding'));
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

    it('should pass activation defaults to the device', () => {
      const setActivationDefaults = vi.spyOn(device, 'setActivationDefaults');

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: {
          enableAutoModeWhenActivating: true,
          enableNightModeWhenActivating: true,
        },
      });

      expect(setActivationDefaults).toHaveBeenCalledWith({
        autoMode: true,
        oscillation: undefined,
        nightMode: true,
      });
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

    it('should read options from config.options without writing to accessory.context', () => {
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

      // Options are no longer smuggled through the accessory context
      expect(mockAccessory.context._deviceOptions).toBeUndefined();
      expect(Object.keys(mockAccessory.context)).toHaveLength(0);
    });
  });

  describe('firmware version', () => {
    it('should set FirmwareRevision from config.firmwareVersion', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        firmwareVersion: '438MPF.00.01.003',
      });

      expect(mockApi._mockInfoService.setCharacteristic).toHaveBeenCalledWith(mockApi.hap.Characteristic.FirmwareRevision, '438MPF.00.01.003');
    });

    it('should not set FirmwareRevision when firmwareVersion is unknown', () => {
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(mockApi._mockInfoService.setCharacteristic).not.toHaveBeenCalledWith(mockApi.hap.Characteristic.FirmwareRevision, expect.anything());
    });
  });

  describe('removal of disabled cached services', () => {
    function cachedService(subtype: string | undefined, displayName: string): Service {
      return { subtype, displayName } as unknown as Service;
    }

    it('should remove a cached jet-focus service when jet focus is disabled', () => {
      const cachedJetFocus = cachedService('jet-focus', 'Jet Focus');
      (mockAccessory as unknown as { services: Service[] }).services = [cachedJetFocus];

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isJetFocusEnabled: false },
      });

      expect(mockAccessory.removeService).toHaveBeenCalledWith(cachedJetFocus);
      expect(mockLog.info).toHaveBeenCalledWith('Removing disabled service "Jet Focus" from', 'Test Dyson');
    });

    it('should remove a cached night-mode service when night mode is disabled', () => {
      const cachedNightMode = cachedService('night-mode', 'Night Mode');
      (mockAccessory as unknown as { services: Service[] }).services = [cachedNightMode];

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { isNightModeEnabled: false },
      });

      expect(mockAccessory.removeService).toHaveBeenCalledWith(cachedNightMode);
    });

    it('should keep a cached optional service that is still active', () => {
      const cachedJetFocus = Object.assign(createMockService(), { subtype: 'jet-focus', displayName: 'Jet Focus' });
      (mockAccessory as unknown as { services: Service[] }).services = [cachedJetFocus as unknown as Service];
      mockAccessory.getServiceById.mockImplementation(((type: unknown, subtype: string) =>
        type === 'Switch' && subtype === 'jet-focus' ? cachedJetFocus : undefined) as never);

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
      });

      expect(accessory.getJetFocusService()?.getService()).toBe(cachedJetFocus);
      expect(mockAccessory.removeService).not.toHaveBeenCalled();
    });

    it('should leave non-optional and unknown-subtype services alone', () => {
      const infoService = cachedService(undefined, 'Accessory Information');
      const unknownSubtype = cachedService('something-else', 'Custom');
      (mockAccessory as unknown as { services: Service[] }).services = [infoService, unknownSubtype];

      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: {
          isJetFocusEnabled: false,
          isNightModeEnabled: false,
          isTemperatureIgnored: true,
          isHumidityIgnored: true,
        },
      });

      expect(mockAccessory.removeService).not.toHaveBeenCalled();
    });
  });

  describe('handleConnect state sync', () => {
    it('should call updateFromState on every service handler', async () => {
      const hp04Device = new DysonLinkDevice(
        { ...defaultDeviceInfo, productType: '527' },
        mockMqttClientFactory,
      );
      accessory = new DysonLinkAccessory({
        accessory: mockAccessory,
        device: hp04Device,
        api: mockApi as unknown as API,
        log: mockLog,
        options: { heatingServiceType: 'both', isContinuousMonitoringEnabled: true },
      });

      const handlers = (accessory as unknown as { getServiceHandlers(): BaseService[] }).getServiceHandlers();
      expect(handlers.length).toBeGreaterThan(5);

      await hp04Device.connect();
      const updateSpy = vi.spyOn(BaseService.prototype, 'updateFromState');
      try {
        mockMqttClient._emit('connect');

        const synced = new Set(updateSpy.mock.contexts);
        for (const handler of handlers) {
          expect(synced.has(handler)).toBe(true);
        }
        expect(updateSpy).toHaveBeenCalledTimes(handlers.length);
      } finally {
        updateSpy.mockRestore();
      }
    });
  });
});
