/**
 * JetFocusService Unit Tests
 */

import { vi, type Mock, type Mocked } from 'vitest';

import { JetFocusService } from '../../../../src/accessories/services/jetFocusService.js';
import type { JetFocusServiceConfig } from '../../../../src/accessories/services/jetFocusService.js';
import { DysonLinkDevice } from '../../../../src/devices/dysonLinkDevice.js';
import type { DeviceInfo, MqttClientFactory } from '../../../../src/devices/index.js';
import type { DysonMqttClient } from '../../../../src/protocol/mqttClient.js';
import type { API, PlatformAccessory, Service, Logging } from 'homebridge';

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

// Create mock HomeKit service
function createMockService() {
  const characteristics = new Map<string, {
    onGet: Mock;
    onSet: Mock;
    setProps: Mock;
    getValue: Mock;
  }>();

  const mockService = {
    setCharacteristic: vi.fn().mockReturnThis(),
    getCharacteristic: vi.fn((char: unknown) => {
      const uuid = typeof char === 'object' && char !== null && 'UUID' in char
        ? (char as { UUID: string }).UUID
        : String(char);
      if (!characteristics.has(uuid)) {
        const charMock = {
          onGet: vi.fn().mockReturnThis(),
          onSet: vi.fn().mockReturnThis(),
          setProps: vi.fn().mockReturnThis(),
          getValue: vi.fn(),
        };
        characteristics.set(uuid, charMock);
      }
      return characteristics.get(uuid);
    }),
    updateCharacteristic: vi.fn(),
    addOptionalCharacteristic: vi.fn().mockReturnThis(),
    addLinkedService: vi.fn().mockReturnThis(),
  };

  return mockService as unknown as Mocked<Service>;
}

// Create mock logging
function createMockLog(): Logging {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  } as unknown as Logging;
}

// Create mock API with hap
function createMockApi() {
  const Characteristic = {
    On: { UUID: 'on-uuid' },
    Name: { UUID: 'name-uuid' },
    ConfiguredName: { UUID: 'configured-name-uuid' },
  };

  const Service = {
    Switch: { UUID: 'switch-uuid' },
  };

  return {
    hap: {
      Service,
      Characteristic,
    },
  } as unknown as API;
}

/**
 * Flush microtask command queue.
 * Commands are batched via queueMicrotask in DysonLinkDevice.
 */
async function flushCommands(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('JetFocusService', () => {
  let jetFocusService: JetFocusService;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;
  let device: DysonLinkDevice;
  let mockService: ReturnType<typeof createMockService>;
  let mockAccessory: PlatformAccessory;
  let mockLog: Logging;
  let mockApi: API;

  // Store handlers for testing
  let onGetHandler: () => unknown;
  let onSetHandler: (value: unknown) => Promise<void>;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'HP04-AB-12345678',
    productType: '527',
    name: 'Living Room Fan',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(async () => {
    // Set up mocks
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new DysonLinkDevice(defaultDeviceInfo, mockMqttClientFactory);

    mockService = createMockService();
    mockLog = createMockLog();
    mockApi = createMockApi();

    mockAccessory = {
      displayName: 'Living Room Fan',
      getServiceById: vi.fn().mockReturnValue(null),
      addService: vi.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory;

    // Connect device so we can control it
    await device.connect();

    const config: JetFocusServiceConfig = {
      accessory: mockAccessory,
      device,
      api: mockApi,
      log: mockLog,
    };

    jetFocusService = new JetFocusService(config);

    const Characteristic = mockApi.hap.Characteristic;

    // Extract handlers from mock calls
    const onChar = mockService.getCharacteristic(Characteristic.On);
    onGetHandler = (onChar!.onGet as Mock).mock.calls[0][0];
    onSetHandler = (onChar!.onSet as Mock).mock.calls[0][0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create Switch service with jet-focus subtype', () => {
      expect(mockAccessory.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.Switch,
        'jet-focus',
      );
      expect(mockAccessory.addService).toHaveBeenCalledWith(
        mockApi.hap.Service.Switch,
        'Jet Focus',
        'jet-focus',
      );
    });

    it('should set configured name', () => {
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
      );
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        mockApi.hap.Characteristic.ConfiguredName,
        'Jet Focus',
      );
    });

    it('should register On characteristic handlers', () => {
      const char = mockService.getCharacteristic(mockApi.hap.Characteristic.On);
      expect(char!.onGet).toHaveBeenCalled();
      expect(char!.onSet).toHaveBeenCalled();
    });

    it('should return the service', () => {
      expect(jetFocusService.getService()).toBe(mockService);
    });

    it('should use existing service if available', async () => {
      // Create a new accessory with existing service
      const existingService = createMockService();
      const accessoryWithExistingService = {
        displayName: 'Living Room Fan',
        getServiceById: vi.fn().mockReturnValue(existingService),
        addService: vi.fn().mockReturnValue(mockService),
      } as unknown as PlatformAccessory;

      const config: JetFocusServiceConfig = {
        accessory: accessoryWithExistingService,
        device,
        api: mockApi,
        log: mockLog,
      };

      const service = new JetFocusService(config);

      expect(accessoryWithExistingService.getServiceById).toHaveBeenCalledWith(
        mockApi.hap.Service.Switch,
        'jet-focus',
      );
      expect(accessoryWithExistingService.addService).not.toHaveBeenCalled();
      expect(service.getService()).toBe(existingService);
    });
  });

  describe('On characteristic', () => {
    it('should return false when jet focus is off', () => {
      const result = onGetHandler();
      expect(result).toBe(false);
    });

    it('should return true when jet focus is on', async () => {
      // Set frontAirflow state directly on device
      device.state.frontAirflow = true;

      const result = onGetHandler();
      expect(result).toBe(true);
    });

    it('should call setJetFocus(true) when set to true', async () => {
      await onSetHandler(true);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { ffoc: 'ON' },
        }),
      );
    });

    it('should call setJetFocus(false) when set to false', async () => {
      await onSetHandler(false);
      await flushCommands();

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ffoc: 'OFF' },
        }),
      );
    });
  });

  describe('state change handling', () => {
    it('should update On characteristic when device state changes', async () => {
      // Update device state with frontAirflow
      device.updateState({
        frontAirflow: true,
      });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        true,
      );
    });

    it('should update characteristic when jet focus turns off', async () => {
      // First turn on
      device.updateState({
        frontAirflow: true,
      });

      mockService.updateCharacteristic.mockClear();

      // Then turn off
      device.updateState({
        frontAirflow: false,
      });

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        false,
      );
    });
  });

  describe('updateFromState', () => {
    it('should update On characteristic from current device state', async () => {
      // Set device state directly
      device.state.frontAirflow = true;

      mockService.updateCharacteristic.mockClear();

      jetFocusService.updateFromState();

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        true,
      );
    });

    it('should update with false when frontAirflow is undefined', async () => {
      mockService.updateCharacteristic.mockClear();

      jetFocusService.updateFromState();

      const Characteristic = mockApi.hap.Characteristic;

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        Characteristic.On,
        false,
      );
    });
  });

  describe('error handling', () => {
    it('should emit commandError when setJetFocus MQTT publish fails', async () => {
      mockMqttClient.publishCommand.mockRejectedValueOnce(new Error('MQTT error'));

      const errorHandler = vi.fn();
      device.on('commandError', errorHandler);

      await onSetHandler(true);
      await flushCommands();

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
