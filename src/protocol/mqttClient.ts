/**
 * MQTT Client Wrapper for Dyson Devices
 * Provides a clean interface for MQTT communication with Dyson devices
 */

import { EventEmitter } from 'events';
import mqtt from 'mqtt';
import type { MqttClient as MqttClientType, IClientOptions } from 'mqtt';

import { DYSON_MQTT_PORT } from '../config/index.js';
import { sleep, calculateBackoff, RECONNECT_DEFAULTS } from '../utils/retry.js';

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
  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
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
  /** Emitted when attempting to reconnect (includes attempt number) */
  reconnect: [number];
  /** Emitted when all reconnection attempts have failed */
  reconnectFailed: [];
  /** Emitted when device goes offline (during reconnection) */
  offline: [];
}

/** Default connection timeout */
const DEFAULT_TIMEOUT = 10000;

/** Default keep-alive interval */
const DEFAULT_KEEPALIVE = 30;

/**
 * MQTT protocol version (4 = MQTT 3.1.1)
 * @see https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html
 */
const MQTT_PROTOCOL_VERSION = 4;

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
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private intentionalDisconnect = false;

  constructor(options: MqttClientOptions, mqttConnect: MqttConnectFn = defaultMqttConnect) {
    super();
    this.options = {
      host: options.host,
      serial: options.serial,
      credentials: options.credentials,
      productType: options.productType,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      keepalive: options.keepalive ?? DEFAULT_KEEPALIVE,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? RECONNECT_DEFAULTS.maxAttempts,
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
        protocolVersion: MQTT_PROTOCOL_VERSION,
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
        const wasReconnecting = this.isReconnecting;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.emit('connect');

        // Re-subscribe to topics after reconnection
        if (wasReconnecting && this.subscribedTopics.size > 0) {
          this.resubscribeToTopics().catch((error) => {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
          });
        }

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
        this.emit('close');

        if (wasConnected && !this.intentionalDisconnect) {
          this.emit('disconnect');
          this.emit('offline');
          this.handleReconnection();
        }
      });

      this.client.on('reconnect', () => {
        // This is the mqtt library's internal reconnect event - we handle our own
      });

      this.client.on('offline', () => {
        const wasConnected = this.connected;
        this.connected = false;

        if (wasConnected && !this.intentionalDisconnect) {
          this.emit('disconnect');
          this.emit('offline');
          this.handleReconnection();
        }
      });
    });
  }

  /**
   * Disconnect from the device
   *
   * @param intentional - Whether this is an intentional disconnect (prevents auto-reconnect)
   */
  async disconnect(intentional = true): Promise<void> {
    if (!this.client) {
      return;
    }

    if (intentional) {
      this.intentionalDisconnect = true;
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
   * Get the current reconnection attempt count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Check if currently in reconnection state
   */
  isReconnectingState(): boolean {
    return this.isReconnecting;
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
   * Handle automatic reconnection with exponential backoff
   */
  private handleReconnection(): void {
    // Skip if auto-reconnect is disabled or intentional disconnect
    if (!this.options.autoReconnect || this.intentionalDisconnect) {
      return;
    }

    // Skip if already reconnecting
    if (this.isReconnecting) {
      return;
    }

    // Check if max attempts reached
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit('reconnectFailed');
      return;
    }

    this.isReconnecting = true;
    const attempt = this.reconnectAttempts;
    const delay = calculateBackoff(attempt);

    this.emit('reconnect', attempt + 1);

    // Schedule reconnection attempt
    sleep(delay).then(() => {
      // Abort if intentionally disconnected while waiting
      if (this.intentionalDisconnect) {
        this.isReconnecting = false;
        return;
      }

      this.reconnectAttempts++;

      // Clean up existing client before reconnecting
      if (this.client) {
        this.client.removeAllListeners();
        this.client = null;
      }

      // Attempt to reconnect
      this.connect()
        .then(() => {
          // Reconnection successful - handled by connect event
        })
        .catch(() => {
          // Connection failed, try again if attempts remain
          this.isReconnecting = false;

          if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
            // Schedule another attempt
            this.handleReconnection();
          } else {
            // Max attempts reached
            this.emit('reconnectFailed');
          }
        });
    });
  }

  /**
   * Re-subscribe to all previously subscribed topics
   */
  private async resubscribeToTopics(): Promise<void> {
    const topics = Array.from(this.subscribedTopics);

    for (const topic of topics) {
      await new Promise<void>((resolve, reject) => {
        this.client!.subscribe(topic, { qos: 0 }, (error) => {
          if (error) {
            reject(new Error(`Failed to resubscribe to ${topic}: ${error.message}`));
          } else {
            resolve();
          }
        });
      });
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
    this.isReconnecting = false;
    // Note: subscribedTopics is preserved for reconnection
    // It's only cleared on intentional disconnect
    if (this.intentionalDisconnect) {
      this.subscribedTopics.clear();
      this.reconnectAttempts = 0;
    }
  }
}

// Re-export for convenience
export type { MqttClientType };
