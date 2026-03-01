/**
 * Shared Test Utilities
 *
 * Common mock factories used across all test files.
 * Eliminates duplication of mock creation code.
 */

import { vi, type Mock, type Mocked } from 'vitest';
import type { Logging, PlatformAccessory, Service } from 'homebridge';
import type { DysonMqttClient } from '../../src/protocol/mqttClient.js';
import type { DeviceInfo, MqttClientFactory } from '../../src/devices/index.js';

// ============================================================================
// Mock MQTT Client (for DysonMqttClient - used in device/service tests)
// ============================================================================

export type MockDysonMqttClient = Mocked<DysonMqttClient> & {
  _emit: (event: string, ...args: unknown[]) => void;
};

/**
 * Create a mock DysonMqttClient with event handler support.
 * Used in device and service tests.
 */
export function createMockMqttClient(): MockDysonMqttClient {
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

  return mockClient as unknown as MockDysonMqttClient;
}

// ============================================================================
// Mock raw MQTT client (for mqttClient.test.ts)
// ============================================================================

export type MockRawMqttClient = ReturnType<typeof createMockRawMqttClient>;

/**
 * Create a mock raw MQTT client (mqtt library level).
 * Used in protocol-layer tests for DysonMqttClient.
 */
export function createMockRawMqttClient() {
  const eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const mockClient = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockClient;
    }),
    end: vi.fn((force: boolean, opts: object, callback: () => void) => {
      callback();
    }),
    subscribe: vi.fn((topic: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    unsubscribe: vi.fn((topic: string, callback: (error?: Error) => void) => {
      callback();
    }),
    publish: vi.fn((topic: string, payload: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    removeAllListeners: vi.fn(),
    _emit: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
    _getHandlers: (event: string) => eventHandlers.get(event) || [],
  };

  return mockClient;
}

// ============================================================================
// Mock HomeKit Service
// ============================================================================

/**
 * Create a mock HomeKit Service with characteristic tracking.
 */
export function createMockService() {
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

// ============================================================================
// Mock Logging
// ============================================================================

/**
 * Create a mock Homebridge Logging instance.
 */
export function createMockLog(): Mocked<Logging> {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  } as unknown as Mocked<Logging>;
}

// ============================================================================
// Mock Accessory
// ============================================================================

/**
 * Create a mock PlatformAccessory.
 */
export function createMockAccessory(primaryService?: Mocked<Service>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: vi.fn((serviceType: unknown) => {
      if (primaryService && serviceType === primaryService) {
        return primaryService;
      }
      return undefined;
    }),
    addService: vi.fn(() => primaryService ?? createMockService()),
    removeService: vi.fn(),
    context: { device: {} },
  } as unknown as Mocked<PlatformAccessory>;
}

// ============================================================================
// Test Device Defaults
// ============================================================================

/**
 * Default device info for tests (TP04 model).
 */
export const DEFAULT_DEVICE_INFO: DeviceInfo = {
  serial: 'ABC-AB-12345678',
  productType: '438',
  name: 'Living Room',
  credentials: 'localPassword123',
  ipAddress: '192.168.1.100',
};

/**
 * Create a mock MQTT client factory that returns the given mock client.
 */
export function createMockMqttClientFactory(mockClient: MockDysonMqttClient): MqttClientFactory {
  return vi.fn().mockReturnValue(mockClient) as unknown as MqttClientFactory;
}
