/**
 * MQTT Client Wrapper for Dyson Devices
 * Provides a clean interface for MQTT communication with Dyson devices
 */

import { EventEmitter } from 'events';
import mqtt from 'mqtt';
import type { MqttClient as MqttClientType, IClientOptions } from 'mqtt';

import { DYSON_MQTT_PORT } from '../settings.js';

/**
 * MQTT Client configuration options
 */
export interface MqttClientOptions {
  /** Device IP address */
  host: string;
  /** Device serial number (used as username) */
  serial: string;
  /** Device local credentials (used as password) */
  credentials: string;
  /** Device product type (e.g., '438') */
  productType: string;
  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Keep-alive interval in seconds (default: 30) */
  keepalive?: number;
}

/** MQTT connect function type for dependency injection */
export type MqttConnectFn = (brokerUrl: string, options: IClientOptions) => MqttClientType;

/** Default MQTT connect function */
const defaultMqttConnect: MqttConnectFn = (brokerUrl, options) => mqtt.connect(brokerUrl, options);

/**
 * MQTT message received from device
 */
export interface MqttMessage {
  /** Topic the message was received on */
  topic: string;
  /** Raw message payload */
  payload: Buffer;
  /** Parsed JSON payload (if valid JSON) */
  data?: unknown;
}

/**
 * Events emitted by MqttClient
 */
export interface MqttClientEvents {
  /** Emitted when connected to device */
  connect: [];
  /** Emitted when disconnected from device */
  disconnect: [];
  /** Emitted when a message is received */
  message: [MqttMessage];
  /** Emitted on connection or communication error */
  error: [Error];
  /** Emitted when connection is closed */
  close: [];
  /** Emitted when reconnecting */
  reconnect: [];
}

/** Default connection timeout */
const DEFAULT_TIMEOUT = 10000;

/** Default keep-alive interval */
const DEFAULT_KEEPALIVE = 30;

/**
 * MQTT Client wrapper for Dyson device communication
 *
 * Provides event-driven MQTT communication with Dyson devices.
 * Uses the device serial as username and local credentials as password.
 *
 * @example
 * ```typescript
 * const client = new DysonMqttClient({
 *   host: '192.168.1.100',
 *   serial: 'ABC-AB-12345678',
 *   credentials: 'localPassword',
 *   productType: '438',
 * });
 *
 * client.on('message', (msg) => console.log(msg.data));
 * await client.connect();
 * await client.subscribe(`438/ABC-AB-12345678/status/current`);
 * ```
 */
export class DysonMqttClient extends EventEmitter {
  private client: MqttClientType | null = null;
  private readonly options: Required<MqttClientOptions>;
  private readonly mqttConnect: MqttConnectFn;
  private connected = false;
  private subscribedTopics: Set<string> = new Set();

  constructor(options: MqttClientOptions, mqttConnect: MqttConnectFn = defaultMqttConnect) {
    super();
    this.options = {
      host: options.host,
      serial: options.serial,
      credentials: options.credentials,
      productType: options.productType,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      keepalive: options.keepalive ?? DEFAULT_KEEPALIVE,
    };
    this.mqttConnect = mqttConnect;
  }

  /**
   * Connect to the Dyson device MQTT broker
   *
   * @throws {Error} If connection fails or times out
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    return new Promise((resolve, reject) => {
      const brokerUrl = `mqtt://${this.options.host}:${DYSON_MQTT_PORT}`;

      const mqttOptions: IClientOptions = {
        username: this.options.serial,
        password: this.options.credentials,
        clientId: `homebridge_${this.options.serial}_${Date.now()}`,
        keepalive: this.options.keepalive,
        connectTimeout: this.options.timeout,
        reconnectPeriod: 0, // We handle reconnection manually
        clean: true,
        protocolVersion: 4, // MQTT 3.1.1
      };

      this.client = this.mqttConnect(brokerUrl, mqttOptions);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!this.connected) {
          this.cleanup();
          reject(new Error(`Connection timeout after ${this.options.timeout}ms`));
        }
      }, this.options.timeout);

      this.client.on('connect', () => {
        clearTimeout(timeoutId);
        this.connected = true;
        this.emit('connect');
        resolve();
      });

      this.client.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        if (!this.connected) {
          this.cleanup();
          reject(error);
        } else {
          this.emit('error', error);
        }
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        const message: MqttMessage = {
          topic,
          payload,
        };

        // Try to parse as JSON
        try {
          message.data = JSON.parse(payload.toString('utf8'));
        } catch {
          // Not JSON, leave data undefined
        }

        this.emit('message', message);
      });

      this.client.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        if (wasConnected) {
          this.emit('disconnect');
        }
        this.emit('close');
      });

      this.client.on('reconnect', () => {
        this.emit('reconnect');
      });

      this.client.on('offline', () => {
        this.connected = false;
        this.emit('disconnect');
      });
    });
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          this.cleanup();
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Subscribe to an MQTT topic
   *
   * @param topic - Topic to subscribe to
   * @throws {Error} If not connected or subscription fails
   */
  async subscribe(topic: string): Promise<void> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.client!.subscribe(topic, { qos: 0 }, (error) => {
        if (error) {
          reject(new Error(`Failed to subscribe to ${topic}: ${error.message}`));
        } else {
          this.subscribedTopics.add(topic);
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from an MQTT topic
   *
   * @param topic - Topic to unsubscribe from
   * @throws {Error} If not connected or unsubscription fails
   */
  async unsubscribe(topic: string): Promise<void> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.client!.unsubscribe(topic, (error) => {
        if (error) {
          reject(new Error(`Failed to unsubscribe from ${topic}: ${error.message}`));
        } else {
          this.subscribedTopics.delete(topic);
          resolve();
        }
      });
    });
  }

  /**
   * Publish a message to an MQTT topic
   *
   * @param topic - Topic to publish to
   * @param message - Message to publish (string or object to be JSON serialized)
   * @throws {Error} If not connected or publish fails
   */
  async publish(topic: string, message: string | object): Promise<void> {
    this.ensureConnected();

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    return new Promise((resolve, reject) => {
      this.client!.publish(topic, payload, { qos: 0 }, (error) => {
        if (error) {
          reject(new Error(`Failed to publish to ${topic}: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Subscribe to the device status topic
   *
   * Convenience method to subscribe to the standard status topic:
   * `{productType}/{serial}/status/current`
   */
  async subscribeToStatus(): Promise<void> {
    const topic = this.getStatusTopic();
    await this.subscribe(topic);
  }

  /**
   * Publish a command to the device
   *
   * Convenience method to publish to the standard command topic:
   * `{productType}/{serial}/command`
   *
   * @param command - Command object to send
   */
  async publishCommand(command: object): Promise<void> {
    const topic = this.getCommandTopic();
    await this.publish(topic, command);
  }

  /**
   * Request current state from the device
   *
   * Sends a REQUEST-CURRENT-STATE message to get the device's current state
   */
  async requestCurrentState(): Promise<void> {
    const command = {
      msg: 'REQUEST-CURRENT-STATE',
      time: new Date().toISOString(),
    };
    await this.publishCommand(command);
  }

  /**
   * Get the status topic for this device
   */
  getStatusTopic(): string {
    return `${this.options.productType}/${this.options.serial}/status/current`;
  }

  /**
   * Get the command topic for this device
   */
  getCommandTopic(): string {
    return `${this.options.productType}/${this.options.serial}/command`;
  }

  /**
   * Check if connected to the device
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Get list of currently subscribed topics
   */
  getSubscribedTopics(): string[] {
    return Array.from(this.subscribedTopics);
  }

  /**
   * Get the device serial number
   */
  getSerial(): string {
    return this.options.serial;
  }

  /**
   * Get the device product type
   */
  getProductType(): string {
    return this.options.productType;
  }

  /**
   * Ensure client is connected before operations
   */
  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error('Not connected to MQTT broker');
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.client) {
      this.client.removeAllListeners();
      this.client = null;
    }
    this.connected = false;
    this.subscribedTopics.clear();
  }
}

// Re-export for convenience
export type { MqttClientType };
