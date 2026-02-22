/**
 * Shared Test Utilities
 *
 * Common mock factories used across all test files.
 * Eliminates duplication of mock creation code.
 */

import { jest } from '@jest/globals';
import type { Logging, PlatformAccessory, Service } from 'homebridge';
import type { DysonMqttClient } from '../../src/protocol/mqttClient.js';
import type { DeviceInfo, MqttClientFactory } from '../../src/devices/index.js';

// ============================================================================
// Mock MQTT Client (for DysonMqttClient - used in device/service tests)
// ============================================================================

export type MockDysonMqttClient = jest.Mocked<DysonMqttClient> & {
  _emit: (event: string, ...args: unknown[]) => void;
};

/**
 * Create a mock DysonMqttClient with event handler support.
 * Used in device and service tests.
 */
export function createMockMqttClient(): MockDysonMqttClient {
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
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockClient;
    }),
    end: jest.fn((force: boolean, opts: object, callback: () => void) => {
      callback();
    }),
    subscribe: jest.fn((topic: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    unsubscribe: jest.fn((topic: string, callback: (error?: Error) => void) => {
      callback();
    }),
    publish: jest.fn((topic: string, payload: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    removeAllListeners: jest.fn(),
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
    onGet: jest.Mock;
    onSet: jest.Mock;
    setProps: jest.Mock;
    getValue: jest.Mock;
  }>();

  const mockService = {
    setCharacteristic: jest.fn().mockReturnThis(),
    getCharacteristic: jest.fn((char: unknown) => {
      const uuid = typeof char === 'object' && char !== null && 'UUID' in char
        ? (char as { UUID: string }).UUID
        : String(char);
      if (!characteristics.has(uuid)) {
        const charMock = {
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          setProps: jest.fn().mockReturnThis(),
          getValue: jest.fn(),
        };
        characteristics.set(uuid, charMock);
      }
      return characteristics.get(uuid);
    }),
    updateCharacteristic: jest.fn(),
    addOptionalCharacteristic: jest.fn().mockReturnThis(),
    addLinkedService: jest.fn().mockReturnThis(),
  };

  return mockService as unknown as jest.Mocked<Service>;
}

// ============================================================================
// Mock Logging
// ============================================================================

/**
 * Create a mock Homebridge Logging instance.
 */
export function createMockLog(): jest.Mocked<Logging> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
  } as unknown as jest.Mocked<Logging>;
}

// ============================================================================
// Mock Accessory
// ============================================================================

/**
 * Create a mock PlatformAccessory.
 */
export function createMockAccessory(primaryService?: jest.Mocked<Service>) {
  return {
    displayName: 'Test Dyson',
    UUID: 'test-uuid',
    getService: jest.fn((serviceType: unknown) => {
      if (primaryService && serviceType === primaryService) {
        return primaryService;
      }
      return undefined;
    }),
    addService: jest.fn(() => primaryService ?? createMockService()),
    removeService: jest.fn(),
    context: { device: {} },
  } as unknown as jest.Mocked<PlatformAccessory>;
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
  return jest.fn().mockReturnValue(mockClient) as unknown as MqttClientFactory;
}
