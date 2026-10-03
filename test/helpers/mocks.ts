/**
 * Shared Test Utilities
 *
 * Common mock factories used across the test suite, so each test file only
 * declares what is specific to it (characteristic tables, accessory wiring).
 */

import { vi, type Mock, type Mocked } from 'vitest';
import type { API, Logging, Service } from 'homebridge';
import type { DysonMqttClient } from '../../src/protocol/mqttClient.js';
import type { DeviceInfo, MqttClientFactory } from '../../src/devices/index.js';

type Handler = (...args: unknown[]) => void;

/**
 * Minimal event registry backing the mock clients: `on` registers, `_emit`
 * dispatches, `removeAllListeners` clears (like a real EventEmitter).
 */
function createEventRegistry() {
  const eventHandlers = new Map<string, Handler[]>();
  return {
    add(event: string, handler: Handler): void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
    },
    emit(event: string, ...args: unknown[]): void {
      (eventHandlers.get(event) || []).forEach((handler) => handler(...args));
    },
    get(event: string): Handler[] {
      return eventHandlers.get(event) || [];
    },
    clear(): void {
      eventHandlers.clear();
    },
  };
}

// ============================================================================
// Mock MQTT Client (for DysonMqttClient - used in device/service tests)
// ============================================================================

export type MockDysonMqttClient = Mocked<DysonMqttClient> & {
  /** Dispatch an event to the handlers registered with `on` */
  _emit: (event: string, ...args: unknown[]) => void;
};

/**
 * Create a mock DysonMqttClient with event handler support.
 * Used in device, accessory and service tests.
 */
export function createMockMqttClient(): MockDysonMqttClient {
  const events = createEventRegistry();

  const mockClient = {
    on: vi.fn((event: string, handler: Handler) => {
      events.add(event, handler);
      return mockClient;
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribeToStatus: vi.fn().mockResolvedValue(undefined),
    requestCurrentState: vi.fn().mockResolvedValue(undefined),
    publishCommand: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    removeAllListeners: vi.fn(() => {
      events.clear();
      return mockClient;
    }),
    _emit: events.emit,
  };

  return mockClient as unknown as MockDysonMqttClient;
}

/**
 * Create a mock MQTT client factory that returns the given mock client.
 */
export function createMockMqttClientFactory(mockClient: MockDysonMqttClient): MqttClientFactory & Mock {
  return vi.fn().mockReturnValue(mockClient) as unknown as MqttClientFactory & Mock;
}

// ============================================================================
// Mock raw MQTT client (mqtt library level, for mqttClient.test.ts)
// ============================================================================

export type MockRawMqttClient = ReturnType<typeof createMockRawMqttClient>;

/**
 * Create a mock raw MQTT client (mqtt library level).
 * Used in protocol-layer tests for DysonMqttClient.
 */
export function createMockRawMqttClient() {
  const events = createEventRegistry();

  const mockClient = {
    on: vi.fn((event: string, handler: Handler) => {
      events.add(event, handler);
      return mockClient;
    }),
    end: vi.fn((_force?: boolean, _opts?: object, callback?: () => void) => {
      if (typeof callback === 'function') {
        callback();
      }
    }),
    subscribe: vi.fn((_topic: string, _opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    unsubscribe: vi.fn((_topic: string, callback: (error?: Error) => void) => {
      callback();
    }),
    publish: vi.fn((_topic: string, _payload: string, _opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    removeAllListeners: vi.fn(() => {
      events.clear();
      return mockClient;
    }),
    _emit: events.emit,
    _getHandlers: events.get,
  };

  return mockClient;
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
// Mock HAP
// ============================================================================

/**
 * Stand-in for HAP's HapStatusError, carrying the numeric status.
 */
export class HapStatusError extends Error {
  constructor(public hapStatus: number) {
    super('HAP ' + hapStatus);
  }
}

/**
 * Create a mock API exposing the given HAP Service/Characteristic tables and
 * HapStatusError. `extras` are merged onto the API object (e.g. `_mockService`
 * handles the test wants to reach later).
 */
export function createMockHapApi<
  S extends object,
  C extends object,
  X extends object = Record<never, never>,
>(tables: { Service: S; Characteristic: C }, extras?: X) {
  return {
    hap: {
      Service: tables.Service,
      Characteristic: tables.Characteristic,
      HapStatusError,
    },
    ...extras,
  } as unknown as Omit<API, 'hap'> & { hap: API['hap'] & { Service: S; Characteristic: C } } & X;
}

/** A mock characteristic as stored by createMockService */
export interface MockCharacteristic {
  onGet: Mock;
  onSet: Mock;
  setProps: Mock;
  getValue: Mock;
  updateValue: Mock;
  value: unknown;
}

export type MockService = Mocked<Service> & {
  /** Characteristic mocks, keyed by UUID (or String(characteristic) when it has none) */
  _getCharacteristics: () => Map<string, MockCharacteristic>;
  /** The mock for one characteristic (created on first access), without recording a getCharacteristic call */
  _getCharacteristic: (characteristic: unknown) => MockCharacteristic;
};

/**
 * Create a mock HomeKit Service with characteristic tracking.
 *
 * Like HAP, `updateCharacteristic` and a characteristic's `updateValue` store
 * the value, so tests can read back what HomeKit would hold.
 *
 * @param initialValue - Value of a characteristic before anything updates it
 */
export function createMockService(initialValue: unknown = undefined): MockService {
  const characteristics = new Map<string, MockCharacteristic>();

  const getCharacteristic = (char: unknown): MockCharacteristic => {
    const key = typeof char === 'object' && char !== null && 'UUID' in char
      ? (char as { UUID: string }).UUID
      : String(char);
    if (!characteristics.has(key)) {
      const charMock: MockCharacteristic = {
        onGet: vi.fn().mockReturnThis(),
        onSet: vi.fn().mockReturnThis(),
        setProps: vi.fn().mockReturnThis(),
        getValue: vi.fn(),
        updateValue: vi.fn((value: unknown) => {
          charMock.value = value;
          return charMock;
        }),
        value: initialValue,
      };
      characteristics.set(key, charMock);
    }
    return characteristics.get(key)!;
  };

  const service = {
    setCharacteristic: vi.fn().mockReturnThis(),
    getCharacteristic: vi.fn(getCharacteristic),
    updateCharacteristic: vi.fn((char: unknown, value: unknown) => {
      getCharacteristic(char).value = value;
      return service;
    }),
    removeCharacteristic: vi.fn(),
    characteristics: [] as { UUID: string }[],
    addOptionalCharacteristic: vi.fn().mockReturnThis(),
    addLinkedService: vi.fn().mockReturnThis(),
    _getCharacteristics: () => characteristics,
    _getCharacteristic: getCharacteristic,
  };

  return service as unknown as MockService;
}

// ============================================================================
// Test Device Defaults
// ============================================================================

/**
 * Default device info for tests (TP04 model).
 * Spread it (`{ ...DEFAULT_DEVICE_INFO }`) when a test may mutate the result.
 */
export const DEFAULT_DEVICE_INFO: Readonly<DeviceInfo> = {
  serial: 'ABC-AB-12345678',
  productType: '438',
  name: 'Living Room',
  credentials: 'localPassword123',
  ipAddress: '192.168.1.100',
};
