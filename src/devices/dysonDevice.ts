/**
 * Base Device Class for Dyson Devices
 *
 * Abstract class that provides common functionality for all Dyson device types.
 * Manages MQTT connection, state, and event emission.
 */

import { EventEmitter } from 'events';

import { DysonMqttClient } from '../protocol/mqttClient.js';
import type { MqttMessage, MqttConnectFn } from '../protocol/mqttClient.js';

import type {
  DeviceInfo,
  DeviceState,
  DeviceFeatures,
  DeviceEvents,
} from './types.js';
import { createDefaultState, DEFAULT_FEATURES } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Polling interval limits and defaults */
const POLLING = {
  /** Default polling interval in seconds */
  DEFAULT_SECONDS: 60,
  /** Minimum allowed polling interval in seconds */
  MIN_SECONDS: 10,
  /** Maximum allowed polling interval in seconds */
  MAX_SECONDS: 300,
  /** Milliseconds per second conversion factor */
  MS_PER_SECOND: 1000,
} as const;

/**
 * MQTT client factory type for dependency injection
 */
export type MqttClientFactory = (
  host: string,
  serial: string,
  credentials: string,
  productType: string,
  mqttConnect?: MqttConnectFn,
) => DysonMqttClient;

/**
 * Default MQTT client factory
 */
const defaultMqttClientFactory: MqttClientFactory = (
  host,
  serial,
  credentials,
  productType,
  mqttConnect?,
) => {
  const options = { host, serial, credentials, productType };
  return mqttConnect
    ? new DysonMqttClient(options, mqttConnect)
    : new DysonMqttClient(options);
};

/**
 * Abstract base class for all Dyson devices
 *
 * Provides:
 * - MQTT client management
 * - Device state management
 * - Event emission for state changes
 * - Abstract methods for device-specific behavior
 *
 * @example
 * ```typescript
 * class PureCoolDevice extends DysonDevice {
 *   readonly productType = '438';
 *   readonly supportedFeatures = { ...DEFAULT_FEATURES, airQualitySensor: true };
 *
 *   protected handleStateMessage(data: unknown): void {
 *     // Parse device-specific state
 *   }
 * }
 * ```
 */
export abstract class DysonDevice extends EventEmitter {
  /** Dyson product type code (e.g., '438' for TP04) */
  abstract readonly productType: string;

  /** Features supported by this device type */
  abstract readonly supportedFeatures: DeviceFeatures;

  /** Device information */
  protected readonly deviceInfo: DeviceInfo;

  /** MQTT client for device communication */
  protected mqttClient: DysonMqttClient | null = null;

  /** Current device state */
  protected state: DeviceState;

  /** MQTT client factory for dependency injection */
  private readonly mqttClientFactory: MqttClientFactory;

  /** Optional MQTT connect function for testing */
  private readonly mqttConnectFn?: MqttConnectFn;

  /** Polling interval handle for periodic state requests */
  private pollingIntervalHandle?: ReturnType<typeof setInterval>;

  /** Polling interval in milliseconds */
  private pollingIntervalMs: number = POLLING.DEFAULT_SECONDS * POLLING.MS_PER_SECOND;

  /**
   * Create a new DysonDevice
   *
   * @param deviceInfo - Device information from discovery
   * @param mqttClientFactory - Optional factory for creating MQTT client (for testing)
   * @param mqttConnectFn - Optional MQTT connect function (for testing)
   */
  constructor(
    deviceInfo: DeviceInfo,
    mqttClientFactory: MqttClientFactory = defaultMqttClientFactory,
    mqttConnectFn?: MqttConnectFn,
  ) {
    super();
    this.deviceInfo = deviceInfo;
    this.state = createDefaultState();
    this.mqttClientFactory = mqttClientFactory;
    this.mqttConnectFn = mqttConnectFn;
  }

  /**
   * Set the polling interval for state updates
   *
   * @param seconds - Interval in seconds (MIN_SECONDS-MAX_SECONDS, default DEFAULT_SECONDS)
   */
  setPollingInterval(seconds: number): void {
    const clampedSeconds = Math.max(
      POLLING.MIN_SECONDS,
      Math.min(POLLING.MAX_SECONDS, seconds),
    );
    this.pollingIntervalMs = clampedSeconds * POLLING.MS_PER_SECOND;

    // If already polling, restart with new interval
    if (this.pollingIntervalHandle) {
      this.stopPolling();
      this.startPolling();
    }
  }

  /**
   * Start periodic polling for state updates
   */
  private startPolling(): void {
    if (this.pollingIntervalHandle) {
      return; // Already polling
    }

    this.pollingIntervalHandle = setInterval(() => {
      if (this.mqttClient?.isConnected()) {
        this.mqttClient.requestCurrentState().catch(() => {
          // Silently ignore errors during polling
        });
      }
    }, this.pollingIntervalMs);
  }

  /**
   * Stop periodic polling
   */
  private stopPolling(): void {
    if (this.pollingIntervalHandle) {
      clearInterval(this.pollingIntervalHandle);
      this.pollingIntervalHandle = undefined;
    }
  }

  /**
   * Connect to the device
   *
   * Establishes MQTT connection, subscribes to status topic,
   * and requests current state.
   *
   * @throws {Error} If connection fails or device IP is not set
   */
  async connect(): Promise<void> {
    if (!this.deviceInfo.ipAddress) {
      throw new Error(`No IP address for device ${this.deviceInfo.serial}`);
    }

    if (this.mqttClient?.isConnected()) {
      return; // Already connected
    }

    // Create MQTT client
    this.mqttClient = this.mqttClientFactory(
      this.deviceInfo.ipAddress,
      this.deviceInfo.serial,
      this.deviceInfo.credentials,
      this.productType,
      this.mqttConnectFn,
    );

    // Set up event handlers
    this.setupMqttHandlers();

    // Connect to device
    await this.mqttClient.connect();

    // Subscribe to status topic
    await this.mqttClient.subscribeToStatus();

    // Request current state
    await this.mqttClient.requestCurrentState();

    // Start periodic polling for state updates
    this.startPolling();

    // Update connection state
    this.updateState({ connected: true });
    this.emit('connect');
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<void> {
    // Stop polling
    this.stopPolling();

    if (this.mqttClient) {
      await this.mqttClient.disconnect();
      this.mqttClient = null;
    }

    this.updateState({ connected: false });
    this.emit('disconnect');
  }

  /**
   * Check if device is connected
   */
  isConnected(): boolean {
    return this.mqttClient?.isConnected() ?? false;
  }

  /**
   * Get current device state
   */
  getState(): Readonly<DeviceState> {
    return { ...this.state };
  }

  /**
   * Get device serial number
   */
  getSerial(): string {
    return this.deviceInfo.serial;
  }

  /**
   * Get device name
   */
  getName(): string {
    return this.deviceInfo.name;
  }

  /**
   * Get device IP address
   */
  getIpAddress(): string | undefined {
    return this.deviceInfo.ipAddress;
  }

  /**
   * Send a command to the device
   *
   * @param data - Command data to send
   * @throws {Error} If not connected
   */
  protected async sendCommand(data: Record<string, unknown>): Promise<void> {
    if (!this.mqttClient?.isConnected()) {
      throw new Error('Device not connected');
    }

    const command = {
      msg: 'STATE-SET',
      time: new Date().toISOString(),
      'mode-reason': 'LAPP',
      data,
    };

    await this.mqttClient.publishCommand(command);
  }

  /**
   * Update device state and emit stateChange event
   *
   * @param partial - Partial state to merge
   */
  protected updateState(partial: Partial<DeviceState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('stateChange', this.state);
  }

  /**
   * Handle incoming MQTT message
   *
   * Routes messages to appropriate handlers based on message type.
   *
   * @param message - MQTT message received
   */
  protected handleMessage(message: MqttMessage): void {
    if (!message.data || typeof message.data !== 'object') {
      return;
    }

    const data = message.data as Record<string, unknown>;
    const msgType = data.msg as string | undefined;

    switch (msgType) {
      case 'CURRENT-STATE':
      case 'STATE-CHANGE':
        this.handleStateMessage(data);
        break;
      case 'ENVIRONMENTAL-CURRENT-SENSOR-DATA':
        this.handleEnvironmentalMessage(data);
        break;
      default:
        // Unknown message type - ignore
        break;
    }
  }

  /**
   * Handle state message from device
   *
   * Must be implemented by subclasses to parse device-specific state.
   *
   * @param data - Parsed message data
   */
  protected abstract handleStateMessage(data: Record<string, unknown>): void;

  /**
   * Handle environmental sensor data
   *
   * Can be overridden by subclasses that support environmental sensors.
   *
   * @param data - Parsed sensor data
   */
  protected handleEnvironmentalMessage(data: Record<string, unknown>): void {
    // Default implementation - subclasses can override
    const sensorData = (data.data as Record<string, unknown>) || data;

    const stateUpdate: Partial<DeviceState> = {};

    // Temperature (in Kelvin * 10)
    if ('tact' in sensorData) {
      const temp = sensorData.tact;
      if (typeof temp === 'string' && temp !== 'OFF') {
        stateUpdate.temperature = parseInt(temp, 10);
      }
    }

    // Humidity percentage
    if ('hact' in sensorData) {
      const humidity = sensorData.hact;
      if (typeof humidity === 'string' && humidity !== 'OFF') {
        stateUpdate.humidity = parseInt(humidity, 10);
      }
    }

    // PM2.5 - newer models use p25r, older Link models use pact
    if ('p25r' in sensorData) {
      const pm25 = sensorData.p25r;
      if (typeof pm25 === 'string' && pm25 !== 'INIT' && pm25 !== 'OFF') {
        stateUpdate.pm25 = parseInt(pm25, 10);
      }
    } else if ('pact' in sensorData) {
      // Older Link series (HP02, TP02) use pact for particulate matter
      const pact = sensorData.pact;
      if (typeof pact === 'string' && pact !== 'INIT' && pact !== 'OFF') {
        stateUpdate.pm25 = parseInt(pact, 10);
      }
    }

    // PM10 - only on newer models (p10r field)
    if ('p10r' in sensorData) {
      const pm10 = sensorData.p10r;
      if (typeof pm10 === 'string' && pm10 !== 'INIT' && pm10 !== 'OFF') {
        stateUpdate.pm10 = parseInt(pm10, 10);
      }
    }

    // VOC index - newer models use va10, older Link models use vact
    if ('va10' in sensorData) {
      const voc = sensorData.va10;
      if (typeof voc === 'string' && voc !== 'INIT' && voc !== 'OFF') {
        stateUpdate.vocIndex = parseInt(voc, 10);
      }
    } else if ('vact' in sensorData) {
      // Older Link series (HP02, TP02) use vact for VOC
      const vact = sensorData.vact;
      if (typeof vact === 'string' && vact !== 'INIT' && vact !== 'OFF') {
        stateUpdate.vocIndex = parseInt(vact, 10);
      }
    }

    // NO2 index - only on newer models with formaldehyde sensor
    if ('noxl' in sensorData) {
      const no2 = sensorData.noxl;
      if (typeof no2 === 'string' && no2 !== 'INIT' && no2 !== 'OFF') {
        stateUpdate.no2Index = parseInt(no2, 10);
      }
    }

    if (Object.keys(stateUpdate).length > 0) {
      this.updateState(stateUpdate);
    }
  }

  /**
   * Set up MQTT client event handlers
   */
  private setupMqttHandlers(): void {
    if (!this.mqttClient) {
      return;
    }

    this.mqttClient.on('message', (message: MqttMessage) => {
      this.handleMessage(message);
    });

    this.mqttClient.on('disconnect', () => {
      this.updateState({ connected: false });
      this.emit('disconnect');
    });

    this.mqttClient.on('connect', () => {
      this.updateState({ connected: true });
      this.emit('connect');
    });

    this.mqttClient.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.mqttClient.on('offline', () => {
      this.updateState({ connected: false });
    });

    this.mqttClient.on('reconnectFailed', () => {
      this.updateState({ connected: false });
      this.emit('error', new Error('Failed to reconnect to device'));
    });
  }
}

// Re-export types for convenience
export type { DeviceInfo, DeviceState, DeviceFeatures, DeviceEvents };
export { createDefaultState, DEFAULT_FEATURES };
