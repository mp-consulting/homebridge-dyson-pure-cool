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

      // Extract device options from config
      const options: DeviceOptions = {
        temperatureOffset: config.temperatureOffset,
        humidityOffset: config.humidityOffset,
        isTemperatureIgnored: config.isTemperatureIgnored,
        isHumidityIgnored: config.isHumidityIgnored,
        isAirQualityIgnored: config.isAirQualityIgnored,
        useFahrenheit: config.useFahrenheit,
        isHeatingDisabled: config.isHeatingDisabled,
        fullRangeHumidity: config.fullRangeHumidity,
        enableAutoModeWhenActivating: config.enableAutoModeWhenActivating,
        isNightModeEnabled: config.isNightModeEnabled,
        isJetFocusEnabled: config.isJetFocusEnabled,
        isContinuousMonitoringEnabled: config.isContinuousMonitoringEnabled,
      };

      // Create the accessory handler
      this.accessoryHandler = new DysonLinkAccessory({
        accessory: this.accessory,
        device: this.device,
        api: this.platform.api,
        log: this.log,
        options,
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

  /**
   * Connect to the Dyson device
   */
  private async connectDevice(): Promise<void> {
    if (!this.device) {
      return;
    }

    try {
      this.log.debug(`Connecting to device ${this.device.getSerial()}...`);
      await this.device.connect();
      this.log.info(`Connected to ${this.device.getSerial()}`);
    } catch (error) {
      this.log.error(`Failed to connect to device ${this.device.getSerial()}:`, error);
    }
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
