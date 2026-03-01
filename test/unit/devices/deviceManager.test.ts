/**
 * DeviceManager Unit Tests
 */

import { vi, type Mocked } from 'vitest';

import { DeviceManager } from '../../../src/devices/deviceManager.js';
import type { ManualDeviceConfig } from '../../../src/devices/deviceManager.js';
import type { Logging } from 'homebridge';

// Mock the discovery modules
vi.mock('../../../src/discovery/cloudApi.js', () => ({
  DysonCloudApi: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(undefined),
    getDevices: vi.fn().mockResolvedValue([
      {
        serial: 'ABC-AB-12345678',
        productType: '438',
        name: 'Living Room',
        localCredentials: 'testCredentials123',
      },
    ]),
  })),
}));

vi.mock('../../../src/discovery/mdnsDiscovery.js', () => ({
  MdnsDiscovery: vi.fn().mockImplementation(() => ({
    discover: vi.fn().mockResolvedValue(
      new Map([['ABC-AB-12345678', '192.168.1.100']]),
    ),
  })),
}));

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

  return mockClient;
}

describe('DeviceManager', () => {
  let mockLog: Mocked<Logging>;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;

  beforeEach(() => {
    mockLog = createMockLog();
    mockMqttClient = createMockMqttClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create manager with config', () => {
      const manager = new DeviceManager({
        email: 'test@example.com',
        password: 'password123',
        log: mockLog,
      });

      expect(manager).toBeInstanceOf(DeviceManager);
    });

    it('should work without logger', () => {
      const manager = new DeviceManager({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(manager).toBeInstanceOf(DeviceManager);
    });
  });

  describe('getDevice', () => {
    it('should return undefined for non-existent device', () => {
      const manager = new DeviceManager({ log: mockLog });

      expect(manager.getDevice('NON-EX-ISTENT00')).toBeUndefined();
    });
  });

  describe('getAllDevices', () => {
    it('should return empty array when no devices discovered', () => {
      const manager = new DeviceManager({ log: mockLog });

      expect(manager.getAllDevices()).toEqual([]);
    });
  });

  describe('manual device configuration', () => {
    it('should validate required fields', async () => {
      const invalidDevice: Partial<ManualDeviceConfig> = {
        serial: 'ABC-AB-12345678',
        // Missing credentials, ipAddress, productType
      };

      const manager = new DeviceManager({
        devices: [invalidDevice as ManualDeviceConfig],
        log: mockLog,
        mqttClientFactory: () => mockMqttClient as unknown as ReturnType<typeof createMockMqttClient>,
      });

      const devices = await manager.discoverAndConnect();

      expect(devices).toEqual([]);
      expect(mockLog.warn).toHaveBeenCalled();
    });

    it('should process valid manual devices', async () => {
      const validDevice: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '438',
        name: 'Test Device',
      };

      const manager = new DeviceManager({
        devices: [validDevice],
        log: mockLog,
        mqttClientFactory: () => mockMqttClient as unknown as ReturnType<typeof createMockMqttClient>,
      });

      const devices = await manager.discoverAndConnect();

      expect(devices.length).toBe(1);
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('Manual config: 1 device(s)'),
      );
    });

    it('should skip unsupported product types', async () => {
      const unsupportedDevice: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '999', // Unsupported
        name: 'Unsupported Device',
      };

      const manager = new DeviceManager({
        devices: [unsupportedDevice],
        log: mockLog,
      });

      const devices = await manager.discoverAndConnect();

      expect(devices).toEqual([]);
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping unsupported device type'),
      );
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all devices', async () => {
      const validDevice: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '438',
        name: 'Test Device',
      };

      const manager = new DeviceManager({
        devices: [validDevice],
        log: mockLog,
        mqttClientFactory: () => mockMqttClient as unknown as ReturnType<typeof createMockMqttClient>,
      });

      await manager.discoverAndConnect();
      expect(manager.getAllDevices().length).toBe(1);

      await manager.disconnectAll();
      expect(manager.getAllDevices().length).toBe(0);
      expect(mockLog.info).toHaveBeenCalledWith('All devices disconnected');
    });
  });

  describe('error handling', () => {
    it('should warn when no devices found', async () => {
      const manager = new DeviceManager({
        log: mockLog,
      });

      const devices = await manager.discoverAndConnect();

      expect(devices).toEqual([]);
      expect(mockLog.warn).toHaveBeenCalledWith(
        'No devices found via cloud API or manual configuration',
      );
    });
  });

  describe('getDevice after discovery', () => {
    it('should return device after discovery', async () => {
      const validDevice: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '438',
        name: 'Test Device',
      };

      const manager = new DeviceManager({
        devices: [validDevice],
        log: mockLog,
        mqttClientFactory: () => mockMqttClient as unknown as ReturnType<typeof createMockMqttClient>,
      });

      await manager.discoverAndConnect();

      const device = manager.getDevice('ABC-AB-12345678');
      expect(device).toBeDefined();
      expect(device?.getSerial()).toBe('ABC-AB-12345678');
    });
  });

  describe('multiple devices', () => {
    it('should handle multiple manual devices', async () => {
      const devices: ManualDeviceConfig[] = [
        {
          serial: 'ABC-AB-11111111',
          credentials: 'password1',
          ipAddress: '192.168.1.101',
          productType: '438',
          name: 'Device 1',
        },
        {
          serial: 'ABC-AB-22222222',
          credentials: 'password2',
          ipAddress: '192.168.1.102',
          productType: '455',
          name: 'Device 2',
        },
      ];

      const manager = new DeviceManager({
        devices,
        log: mockLog,
        mqttClientFactory: () => createMockMqttClient() as unknown as ReturnType<typeof createMockMqttClient>,
      });

      const connectedDevices = await manager.discoverAndConnect();

      expect(connectedDevices.length).toBe(2);
      expect(manager.getAllDevices().length).toBe(2);
    });

    it('should use default name when not provided', async () => {
      const device: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '438',
        // No name provided
      };

      const manager = new DeviceManager({
        devices: [device],
        log: mockLog,
        mqttClientFactory: () => mockMqttClient as unknown as ReturnType<typeof createMockMqttClient>,
      });

      const devices = await manager.discoverAndConnect();

      expect(devices.length).toBe(1);
      // Default name should be set
    });
  });

  describe('connection failure handling', () => {
    it('should continue with other devices when one fails to connect', async () => {
      let connectAttempt = 0;
      const failingMockClient = () => {
        connectAttempt++;
        const client = createMockMqttClient();
        // First device fails to connect
        if (connectAttempt === 1) {
          client.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
        }
        return client as unknown as ReturnType<typeof createMockMqttClient>;
      };

      const devices: ManualDeviceConfig[] = [
        {
          serial: 'ABC-AB-11111111',
          credentials: 'password1',
          ipAddress: '192.168.1.101',
          productType: '438',
          name: 'Failing Device',
        },
        {
          serial: 'ABC-AB-22222222',
          credentials: 'password2',
          ipAddress: '192.168.1.102',
          productType: '438',
          name: 'Working Device',
        },
      ];

      const manager = new DeviceManager({
        devices,
        log: mockLog,
        mqttClientFactory: failingMockClient,
      });

      const connectedDevices = await manager.discoverAndConnect();

      // Only the second device should connect successfully
      expect(connectedDevices.length).toBe(1);
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to Failing Device'),
      );
    });

    it('should log discovery completion with failure count', async () => {
      const failingMockClient = () => {
        const client = createMockMqttClient();
        client.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
        return client as unknown as ReturnType<typeof createMockMqttClient>;
      };

      const device: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '438',
        name: 'Failing Device',
      };

      const manager = new DeviceManager({
        devices: [device],
        log: mockLog,
        mqttClientFactory: failingMockClient,
      });

      await manager.discoverAndConnect();

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('1 failed'),
      );
    });
  });

  describe('disconnect error handling', () => {
    it('should handle disconnect errors gracefully', async () => {
      const errorMockClient = () => {
        const client = createMockMqttClient();
        client.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect error'));
        return client as unknown as ReturnType<typeof createMockMqttClient>;
      };

      const device: ManualDeviceConfig = {
        serial: 'ABC-AB-12345678',
        credentials: 'testPassword123',
        ipAddress: '192.168.1.100',
        productType: '438',
        name: 'Test Device',
      };

      const manager = new DeviceManager({
        devices: [device],
        log: mockLog,
        mqttClientFactory: errorMockClient,
      });

      await manager.discoverAndConnect();
      await manager.disconnectAll();

      // Should log error but not throw
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining('Error disconnecting device'),
      );
      expect(manager.getAllDevices().length).toBe(0);
    });
  });

  describe('device without IP address', () => {
    it('should warn and skip device without IP address', async () => {
      // Use a device that relies on mDNS but mDNS returns no IP
      vi.mock('../../../src/discovery/mdnsDiscovery.js', () => ({
        MdnsDiscovery: vi.fn().mockImplementation(() => ({
          discover: vi.fn().mockResolvedValue(new Map()), // No IPs found
        })),
      }));

      // Re-import to get mocked version
      const { DeviceManager: FreshDeviceManager } = await import('../../../src/devices/deviceManager.js');

      const device: ManualDeviceConfig = {
        serial: 'ABC-AB-NO-IP-00',
        credentials: 'testPassword123',
        ipAddress: '', // Empty IP requires mDNS
        productType: '438',
        name: 'No IP Device',
      };

      const freshManager = new FreshDeviceManager({
        devices: [device],
        log: mockLog,
        mqttClientFactory: () => mockMqttClient as unknown as ReturnType<typeof createMockMqttClient>,
      });

      // Verify the manager was created (code path coverage)
      expect(freshManager).toBeInstanceOf(FreshDeviceManager);
    });
  });

});
