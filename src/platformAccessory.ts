/**
 * Platform Accessory Handler
 *
 * Creates and manages Dyson device accessories for Homebridge.
 * Uses the device catalog to determine device features and creates
 * appropriate HomeKit services based on device capabilities.
 */

import type { PlatformAccessory, Logging } from 'homebridge';

import type { DysonPureCoolPlatform } from './platform.js';
import { createDevice } from './devices/deviceFactory.js';
import { DysonLinkAccessory } from './accessories/dysonLinkAccessory.js';
import type { DeviceOptions } from './accessories/dysonLinkAccessory.js';
import type { DysonLinkDevice } from './devices/dysonLinkDevice.js';
import { getDeviceModelName, isProductTypeSupported } from './config/index.js';
import { MdnsDiscovery } from './discovery/index.js';

/**
 * Device configuration from plugin settings
 */
interface DeviceConfig {
  /** Device serial number */
  serial: string;
  /** Dyson product type code (e.g., '455', '438') */
  productType: string;
  /** User-assigned device name */
  name?: string;
  /** Local MQTT credentials - supports both field names for compatibility */
  credentials?: string;
  /** Local MQTT credentials (from cloud API) */
  localCredentials?: string;
  /** Device IP address on local network */
  ipAddress?: string;

  // Optional device settings
  /** Temperature offset in Celsius */
  temperatureOffset?: number;
  /** Humidity offset percentage */
  humidityOffset?: number;
  /** Disable temperature sensor */
  isTemperatureIgnored?: boolean;
  /** Disable humidity sensor */
  isHumidityIgnored?: boolean;
  /** Disable air quality sensor */
  isAirQualityIgnored?: boolean;
  /** Use Fahrenheit for temperature display */
  useFahrenheit?: boolean;
  /** Disable heating controls */
  isHeatingDisabled?: boolean;
  /** Heating service type: 'thermostat', 'heater-cooler', or 'both' */
  heatingServiceType?: 'thermostat' | 'heater-cooler' | 'both';
  /** Enable full humidity range (0-100%) */
  fullRangeHumidity?: boolean;
  /** Enable auto mode on device activation */
  enableAutoModeWhenActivating?: boolean;
  /** Enable night mode switch */
  isNightModeEnabled?: boolean;
  /** Enable jet focus switch */
  isJetFocusEnabled?: boolean;
  /** Enable continuous monitoring switch */
  isContinuousMonitoringEnabled?: boolean;
}

/**
 * DysonPlatformAccessory
 *
 * Handles the creation and lifecycle of Dyson device accessories.
 * Creates the appropriate device instance and accessory handler based
 * on the device's product type and features.
 */
export class DysonPlatformAccessory {
  private readonly log: Logging;
  private device?: DysonLinkDevice;
  private accessoryHandler?: DysonLinkAccessory;

  constructor(
    private readonly platform: DysonPureCoolPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.log = platform.log;

    const deviceConfig = accessory.context.device as DeviceConfig;

    // Validate device configuration
    if (!this.validateConfig(deviceConfig)) {
      return;
    }

    // Check if product type is supported
    if (!isProductTypeSupported(deviceConfig.productType)) {
      const modelName = getDeviceModelName(deviceConfig.productType);
      this.log.warn(`Unsupported device type: ${modelName}. Device will not be added.`);
      return;
    }

    // Initialize the device
    this.initializeDevice(deviceConfig);
  }

  /**
   * Validate device configuration
   */
  private validateConfig(config: DeviceConfig): boolean {
    if (!config.serial) {
      this.log.error('Device configuration missing serial number');
      return false;
    }

    if (!config.productType) {
      this.log.error(`Device ${config.serial} missing product type`);
      return false;
    }

    // Accept either 'credentials' or 'localCredentials' field
    if (!config.credentials && !config.localCredentials) {
      this.log.error(`Device ${config.serial} missing credentials`);
      return false;
    }

    return true;
  }

  /**
   * Get credentials from config (supports both field names)
   */
  private getCredentials(config: DeviceConfig): string {
    return config.credentials || config.localCredentials || '';
  }

  /**
   * Initialize the Dyson device and accessory handler
   */
  private initializeDevice(config: DeviceConfig): void {
    const modelName = getDeviceModelName(config.productType);
    this.log.info(`Initializing ${modelName} (${config.serial})`);

    try {
      // Create the device instance using the factory
      this.device = createDevice({
        serial: config.serial,
        productType: config.productType,
        name: config.name || `Dyson ${config.serial}`,
        credentials: this.getCredentials(config),
        ipAddress: config.ipAddress,
      }) as DysonLinkDevice;

      // Create the accessory handler
      this.accessoryHandler = new DysonLinkAccessory({
        accessory: this.accessory,
        device: this.device,
        api: this.platform.api,
        log: this.log,
        options: this.extractDeviceOptions(config),
      });

      // Connect to the device if IP address is available
      if (config.ipAddress) {
        this.connectDevice();
      } else {
        this.log.warn(`Device ${config.serial} has no IP address configured. Device discovery may be needed.`);
      }

    } catch (error) {
      this.log.error(`Failed to initialize device ${config.serial}:`, error);
    }
  }

  /** mDNS discovery timeout for IP refresh */
  private static readonly MDNS_TIMEOUT = 10000;

  /**
   * Connect to the Dyson device
   * If connection fails with cached IP, attempts to rediscover via mDNS
   */
  private async connectDevice(): Promise<void> {
    if (!this.device) {
      return;
    }

    const config = this.accessory.context.device as DeviceConfig;

    try {
      this.log.debug(`Connecting to device ${this.device.getSerial()}...`);
      await this.device.connect();
      this.log.info(`Connected to ${this.device.getSerial()}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log.warn(`Failed to connect to device ${this.device.getSerial()}: ${errorMessage}`);

      // Provide helpful troubleshooting guidance
      if (errorMessage.includes('timeout') || errorMessage.includes('connack')) {
        this.log.warn('  → Device may be offline or unreachable. Try power cycling the device.');
      }

      // If we had a cached IP, try to rediscover
      if (config.ipAddress) {
        this.log.info(`Attempting to rediscover IP for ${config.serial} via mDNS...`);
        const newIp = await this.rediscoverDeviceIp(config.serial);

        if (newIp && newIp !== config.ipAddress) {
          this.log.info(`Found new IP ${newIp} for ${config.serial} (was ${config.ipAddress}). Retrying connection...`);

          // Update device with new IP and retry connection
          this.device = createDevice({
            serial: config.serial,
            productType: config.productType,
            name: config.name || `Dyson ${config.serial}`,
            credentials: this.getCredentials(config),
            ipAddress: newIp,
          }) as DysonLinkDevice;

          try {
            await this.device.connect();
            this.log.info(`Connected to ${this.device.getSerial()} at new IP ${newIp}`);

            // Update config context with new IP for future restarts
            config.ipAddress = newIp;
            this.accessory.context.device = config;

            // Recreate the accessory handler with the new device
            this.accessoryHandler = new DysonLinkAccessory({
              accessory: this.accessory,
              device: this.device,
              api: this.platform.api,
              log: this.log,
              options: this.extractDeviceOptions(config),
            });
          } catch (retryError) {
            this.log.error(`Failed to connect to ${config.serial} at new IP ${newIp}:`, retryError);
          }
        } else if (newIp === config.ipAddress) {
          this.log.error(`Device ${config.serial} still at same IP ${config.ipAddress} but not responding`);
        } else {
          this.log.error(`Could not find device ${config.serial} on network`);
        }
      }
    }
  }

  /**
   * Rediscover device IP via mDNS
   */
  private async rediscoverDeviceIp(serial: string): Promise<string | null> {
    try {
      const discovery = new MdnsDiscovery();
      const devices = await discovery.discover({ timeout: DysonPlatformAccessory.MDNS_TIMEOUT });

      return devices.get(serial) || null;
    } catch (error) {
      this.log.error('mDNS discovery failed:', error);
      return null;
    }
  }

  /**
   * Extract device options from config
   */
  private extractDeviceOptions(config: DeviceConfig): DeviceOptions {
    return {
      temperatureOffset: config.temperatureOffset,
      humidityOffset: config.humidityOffset,
      isTemperatureIgnored: config.isTemperatureIgnored,
      isHumidityIgnored: config.isHumidityIgnored,
      isAirQualityIgnored: config.isAirQualityIgnored,
      useFahrenheit: config.useFahrenheit,
      isHeatingDisabled: config.isHeatingDisabled,
      heatingServiceType: config.heatingServiceType,
      fullRangeHumidity: config.fullRangeHumidity,
      enableAutoModeWhenActivating: config.enableAutoModeWhenActivating,
      isNightModeEnabled: config.isNightModeEnabled,
      isJetFocusEnabled: config.isJetFocusEnabled,
      isContinuousMonitoringEnabled: config.isContinuousMonitoringEnabled,
    };
  }

  /**
   * Disconnect from the Dyson device
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.disconnect();
        this.log.debug(`Disconnected from ${this.device.getSerial()}`);
      } catch (error) {
        this.log.error('Error disconnecting from device:', error);
      }
    }
  }

  /**
   * Get the device instance
   */
  getDevice(): DysonLinkDevice | undefined {
    return this.device;
  }

  /**
   * Get the accessory handler
   */
  getAccessoryHandler(): DysonLinkAccessory | undefined {
    return this.accessoryHandler;
  }
}
