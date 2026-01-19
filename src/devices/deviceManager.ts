/**
 * Device Manager
 *
 * Orchestrates device discovery, creation, and connection management.
 * Combines cloud API and mDNS discovery to create and connect devices.
 */

import type { Logging } from 'homebridge';

import { DysonCloudApi, MdnsDiscovery } from '../discovery/index.js';
import type { DeviceInfo as CloudDeviceInfo } from '../discovery/types.js';
import { CloudApiError, CloudApiErrorType } from '../discovery/types.js';
import type { DysonDevice, MqttClientFactory } from './dysonDevice.js';
import { createDevice, isProductTypeSupported } from './deviceFactory.js';
import type { DeviceInfo } from './types.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';

/**
 * Configuration for DeviceManager
 */
export interface DeviceManagerConfig {
  /** Dyson account email (for cloud discovery) */
  email?: string;
  /** Dyson account password */
  password?: string;
  /** Country code for Dyson API */
  countryCode?: string;
  /** Manually configured devices */
  devices?: ManualDeviceConfig[];
  /** mDNS discovery timeout in milliseconds */
  discoveryTimeout?: number;
  /** Logger instance */
  log?: Logging;
  /** MQTT client factory (for testing) */
  mqttClientFactory?: MqttClientFactory;
  /** MQTT connect function (for testing) */
  mqttConnectFn?: MqttConnectFn;
}

/**
 * Manual device configuration
 */
export interface ManualDeviceConfig {
  /** Device serial number */
  serial: string;
  /** Local MQTT credentials (password hash) */
  credentials: string;
  /** Device IP address */
  ipAddress: string;
  /** Device name (optional) */
  name?: string;
  /** Product type (e.g., '438', '455') */
  productType: string;
}

/**
 * Discovery result summary
 */
export interface DiscoveryResult {
  /** Total devices found */
  total: number;
  /** Devices successfully connected */
  connected: number;
  /** Devices that failed to connect */
  failed: number;
  /** Unsupported device product types */
  unsupported: string[];
}

/** Default mDNS discovery timeout */
const DEFAULT_DISCOVERY_TIMEOUT = 10000;

/**
 * DeviceManager orchestrates device discovery and connection management
 *
 * Supports two discovery modes:
 * 1. Cloud API + mDNS: Retrieves device list from cloud, discovers IPs via mDNS
 * 2. Manual: Uses manually configured device credentials and IPs
 *
 * @example
 * ```typescript
 * const manager = new DeviceManager({
 *   email: 'user@example.com',
 *   password: 'password',
 *   log: homebridge.log,
 * });
 * const devices = await manager.discoverAndConnect();
 * const myDevice = manager.getDevice('ABC-AB-12345678');
 * ```
 */
export class DeviceManager {
  private readonly config: DeviceManagerConfig;
  private readonly log: Logging;
  private readonly devices: Map<string, DysonDevice> = new Map();

  constructor(config: DeviceManagerConfig) {
    this.config = config;
    this.log = config.log ?? this.createNullLogger();
  }

  /**
   * Discover devices and establish connections
   *
   * Combines cloud API discovery (if credentials provided) with mDNS discovery,
   * and also includes any manually configured devices.
   *
   * @returns Array of connected DysonDevice instances
   */
  async discoverAndConnect(): Promise<DysonDevice[]> {
    const deviceInfos: DeviceInfo[] = [];
    const result: DiscoveryResult = {
      total: 0,
      connected: 0,
      failed: 0,
      unsupported: [],
    };

    // Phase 1: Cloud API discovery (if credentials provided)
    if (this.config.email && this.config.password) {
      try {
        const cloudDevices = await this.discoverFromCloud();
        deviceInfos.push(...cloudDevices);
        this.log.info(`Cloud API: Found ${cloudDevices.length} device(s)`);
      } catch (error) {
        this.handleCloudError(error);
      }
    }

    // Phase 2: Add manually configured devices
    if (this.config.devices && this.config.devices.length > 0) {
      const manualDevices = this.processManualDevices();
      // Only add manual devices not already discovered from cloud
      for (const device of manualDevices) {
        if (!deviceInfos.some((d) => d.serial === device.serial)) {
          deviceInfos.push(device);
        }
      }
      this.log.info(`Manual config: ${manualDevices.length} device(s)`);
    }

    result.total = deviceInfos.length;

    if (deviceInfos.length === 0) {
      this.log.warn('No devices found via cloud API or manual configuration');
      return [];
    }

    // Phase 3: mDNS discovery to get IP addresses
    const ipAddresses = await this.discoverIPAddresses(deviceInfos);

    // Phase 4: Create and connect devices
    for (const deviceInfo of deviceInfos) {
      // Skip unsupported product types
      if (!isProductTypeSupported(deviceInfo.productType)) {
        this.log.warn(`Skipping unsupported device type: ${deviceInfo.productType} (${deviceInfo.name})`);
        result.unsupported.push(deviceInfo.productType);
        continue;
      }

      // Get IP address (from mDNS or manual config)
      const ipAddress = deviceInfo.ipAddress || ipAddresses.get(deviceInfo.serial);
      if (!ipAddress) {
        this.log.warn(`No IP address found for device ${deviceInfo.serial} (${deviceInfo.name})`);
        result.failed++;
        continue;
      }

      // Create device with IP address
      const completeInfo: DeviceInfo = {
        ...deviceInfo,
        ipAddress,
      };

      try {
        const device = await this.createAndConnectDevice(completeInfo);
        this.devices.set(deviceInfo.serial, device);
        result.connected++;
        this.log.info(`Connected to ${deviceInfo.name} (${deviceInfo.serial})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log.error(`Failed to connect to ${deviceInfo.name}: ${errorMessage}`);

        // Provide helpful troubleshooting guidance
        if (errorMessage.includes('timeout') || errorMessage.includes('connack')) {
          this.log.error('  → Device may be offline or unreachable. Try:');
          this.log.error('    • Power cycle the device (unplug for 10 seconds)');
          this.log.error('    • Ensure device is on the same network as Homebridge');
          this.log.error(`    • Check if IP address ${ipAddress} is correct`);
        } else if (errorMessage.includes('ECONNREFUSED')) {
          this.log.error(`  → Connection refused at ${ipAddress}. Device may have a different IP.`);
        } else if (errorMessage.includes('credentials') || errorMessage.includes('auth')) {
          this.log.error('  → Authentication failed. Re-authenticate via the plugin settings.');
        }
        result.failed++;
      }
    }

    this.log.info(
      `Discovery complete: ${result.connected}/${result.total} devices connected` +
        (result.failed > 0 ? `, ${result.failed} failed` : '') +
        (result.unsupported.length > 0 ? `, ${result.unsupported.length} unsupported` : ''),
    );

    return Array.from(this.devices.values());
  }

  /**
   * Get a device by serial number
   *
   * @param serial - Device serial number
   * @returns DysonDevice instance or undefined
   */
  getDevice(serial: string): DysonDevice | undefined {
    return this.devices.get(serial);
  }

  /**
   * Get all connected devices
   *
   * @returns Array of all DysonDevice instances
   */
  getAllDevices(): DysonDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Disconnect all devices
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.devices.values()).map((device) =>
      device.disconnect().catch((error) => {
        this.log.error(`Error disconnecting device: ${error}`);
      }),
    );

    await Promise.all(disconnectPromises);
    this.devices.clear();
    this.log.info('All devices disconnected');
  }

  /**
   * Discover devices from Dyson Cloud API
   */
  private async discoverFromCloud(): Promise<DeviceInfo[]> {
    const api = new DysonCloudApi({
      email: this.config.email!,
      password: this.config.password!,
      countryCode: this.config.countryCode,
    });

    await api.authenticate();
    const cloudDevices = await api.getDevices();

    // Convert CloudDeviceInfo to DeviceInfo
    return cloudDevices.map((device: CloudDeviceInfo) => ({
      serial: device.serial,
      productType: device.productType,
      name: device.name,
      credentials: device.localCredentials,
    }));
  }

  /**
   * Process manually configured devices
   */
  private processManualDevices(): DeviceInfo[] {
    if (!this.config.devices) {
      return [];
    }

    return this.config.devices
      .filter((device) => this.validateManualDevice(device))
      .map((device) => ({
        serial: device.serial,
        productType: device.productType,
        name: device.name || `Dyson ${device.serial}`,
        credentials: device.credentials,
        ipAddress: device.ipAddress,
      }));
  }

  /**
   * Validate manual device configuration
   */
  private validateManualDevice(device: ManualDeviceConfig): boolean {
    if (!device.serial || !device.credentials || !device.ipAddress || !device.productType) {
      this.log.warn(
        'Invalid manual device config: missing required fields (serial, credentials, ipAddress, productType)',
      );
      return false;
    }
    return true;
  }

  /**
   * Discover IP addresses via mDNS for devices without IPs
   */
  private async discoverIPAddresses(devices: DeviceInfo[]): Promise<Map<string, string>> {
    const devicesNeedingIP = devices.filter((d) => !d.ipAddress);

    if (devicesNeedingIP.length === 0) {
      return new Map();
    }

    this.log.debug(`Discovering IP addresses for ${devicesNeedingIP.length} device(s) via mDNS...`);

    const discovery = new MdnsDiscovery();
    const ipAddresses = await discovery.discover({
      timeout: this.config.discoveryTimeout ?? DEFAULT_DISCOVERY_TIMEOUT,
    });

    this.log.debug(`mDNS discovery found ${ipAddresses.size} device(s)`);

    return ipAddresses;
  }

  /**
   * Create and connect a device
   */
  private async createAndConnectDevice(deviceInfo: DeviceInfo): Promise<DysonDevice> {
    const device = createDevice(
      deviceInfo,
      this.config.mqttClientFactory,
      this.config.mqttConnectFn,
    );

    // Set up event handlers
    device.on('connect', () => {
      this.log.debug(`Device ${deviceInfo.serial} connected`);
    });

    device.on('disconnect', () => {
      this.log.debug(`Device ${deviceInfo.serial} disconnected`);
    });

    device.on('error', (error: Error) => {
      this.log.error(`Device ${deviceInfo.serial} error:`, error);
    });

    // Connect to the device
    await device.connect();

    return device;
  }

  /**
   * Handle cloud API errors with appropriate logging
   */
  private handleCloudError(error: unknown): void {
    if (error instanceof CloudApiError) {
      switch (error.type) {
        case CloudApiErrorType.TWO_FACTOR_REQUIRED:
          this.log.error(
            '2FA required. Use manual device configuration.',
          );
          break;
        case CloudApiErrorType.AUTHENTICATION_FAILED:
          this.log.error('Cloud API authentication failed. Check your email and password.');
          break;
        case CloudApiErrorType.RATE_LIMITED:
          this.log.error('Cloud API rate limited. Please try again later.');
          break;
        case CloudApiErrorType.NETWORK_ERROR:
          this.log.error(`Cloud API network error: ${error.message}`);
          break;
        default:
          this.log.error(`Cloud API error: ${error.message}`);
      }
    } else {
      this.log.error('Cloud API error:', error);
    }
  }

  /**
   * Create a null logger for when no logger is provided
   */
  private createNullLogger(): Logging {
    const noop = () => {};
    return {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
      log: noop,
      success: noop,
    } as unknown as Logging;
  }
}
