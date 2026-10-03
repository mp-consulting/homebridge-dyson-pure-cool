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
  /** Firmware version reported by the Dyson cloud */
  firmwareVersion?: string;

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
  /** Enable auto mode automatically when the device is turned on */
  enableAutoModeWhenActivating?: boolean;
  /** Enable oscillation automatically when the device is turned on */
  enableOscillationWhenActivating?: boolean;
  /** Enable night mode automatically when the device is turned on */
  enableNightModeWhenActivating?: boolean;
  /** Enable night mode switch */
  isNightModeEnabled?: boolean;
  /** Enable jet focus switch */
  isJetFocusEnabled?: boolean;
  /** Enable continuous monitoring switch */
  isContinuousMonitoringEnabled?: boolean;
  /** Disable filter status service */
  isFilterStatusDisabled?: boolean;
  /** Disable humidifier control service */
  isHumidifierDisabled?: boolean;
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

  /** Retry interval when device is offline (5 minutes) */
  private static readonly OFFLINE_RETRY_MS = 5 * 60 * 1000;
  private offlineRetryTimer?: NodeJS.Timeout;
  private isIntentionalDisconnect = false;

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
        firmwareVersion: config.firmwareVersion,
      });

      // Apply polling interval from config if set
      const pollingInterval = this.platform.config.pollingInterval as number | undefined;
      if (pollingInterval) {
        this.device.setPollingInterval(pollingInterval);
      }

      // Log device errors and catch MQTT reconnection exhaustion
      this.attachDeviceListeners();

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
   * Log device errors (an 'error' event without a listener would crash
   * Homebridge) and schedule a periodic retry once the MQTT client gives up
   * reconnecting (device went offline mid-session).
   */
  private attachDeviceListeners(): void {
    if (!this.device) {
      return;
    }
    const serial = this.device.getSerial();
    this.device.on('error', (error: Error) => {
      this.log.error(`[${serial}] Device error: ${error.message}`);
    });
    this.device.on('reconnectFailed', () => {
      if (!this.isIntentionalDisconnect) {
        this.log.warn(`[${serial}] MQTT reconnection exhausted — device is offline. Will retry in 5 min.`);
        this.scheduleOfflineRetry();
      }
    });
  }

  /**
   * Schedule a connection retry after OFFLINE_RETRY_MS.
   * Called both after a failed initial connection and after MQTT reconnection exhaustion.
   */
  private scheduleOfflineRetry(): void {
    clearTimeout(this.offlineRetryTimer);
    this.offlineRetryTimer = setTimeout(async () => {
      if (this.isIntentionalDisconnect) {
        return;
      }
      const serial = (this.accessory.context.device as DeviceConfig).serial;
      this.log.info(`[${serial}] Retrying connection to offline device...`);
      await this.connectDevice();
    }, DysonPlatformAccessory.OFFLINE_RETRY_MS);
    this.offlineRetryTimer.unref();
  }

  /**
   * Connect to the Dyson device.
   * If connection fails with cached IP, attempts mDNS rediscovery.
   * If the device is truly offline, schedules a retry every 5 minutes.
   */
  private async connectDevice(): Promise<void> {
    if (!this.device) {
      return;
    }

    clearTimeout(this.offlineRetryTimer);

    const config = this.accessory.context.device as DeviceConfig;

    try {
      this.log.debug(`Connecting to device ${this.device.getSerial()}...`);
      await this.device.connect();
      const variant = this.device.getActiveVariant();
      if (variant && variant.label !== 'default') {
        this.log.info(
          `Connected to ${this.device.getSerial()} using fallback variant '${variant.label}' ` +
          `(protocolVersion=${variant.protocolVersion}, clean=${variant.clean})`,
        );
      } else {
        this.log.info(`Connected to ${this.device.getSerial()}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log.warn(`Failed to connect to device ${this.device.getSerial()}: ${errorMessage}`);

      // If we had a cached IP, try mDNS rediscovery once
      if (config.ipAddress) {
        this.log.info(`Attempting to rediscover IP for ${config.serial} via mDNS...`);
        const newIp = await this.rediscoverDeviceIp(config.serial);

        if (newIp && newIp !== config.ipAddress) {
          this.log.warn(
            `Device ${config.serial} answered mDNS at ${newIp} instead of ${config.ipAddress}. ` +
            'Set a static IP for the device if this was not expected.',
          );

          // Reuse the same device instance so the HomeKit handlers stay bound to it
          try {
            await this.device.disconnect();
            this.device.setIpAddress(newIp);
            await this.device.connect();
            this.log.info(`Connected to ${this.device.getSerial()} at new IP ${newIp}`);
            this.persistDiscoveredIp(config, newIp);
            return; // Connected successfully
          } catch (retryError) {
            const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
            this.log.warn(`Failed to connect to ${config.serial} at new IP ${newIp}: ${retryMsg}`);
            this.device.setIpAddress(config.ipAddress);
          }
        } else if (newIp === config.ipAddress) {
          this.log.warn(`Device ${config.serial} found at same IP ${config.ipAddress} but not responding`);
        } else {
          this.log.warn(`Device ${config.serial} not found on network — it may be offline`);
        }
      }

      // Device is unreachable — schedule a retry so it reconnects when powered back on
      this.log.info(`[${config.serial}] Will retry connection in 5 min`);
      this.scheduleOfflineRetry();
    }
  }

  /**
   * Remember an IP found via mDNS so the next restart connects to it
   * directly. The platform applies it while the configured IP is unchanged.
   */
  private persistDiscoveredIp(config: DeviceConfig, newIp: string): void {
    const previous = this.accessory.context.ipOverride as { from?: string } | undefined;
    this.accessory.context.ipOverride = { from: previous?.from ?? config.ipAddress, to: newIp };
    config.ipAddress = newIp;
    this.accessory.context.device = config;
    this.platform.api.updatePlatformAccessories([this.accessory]);
  }

  /**
   * Rediscover device IP via mDNS
   */
  private async rediscoverDeviceIp(serial: string): Promise<string | null> {
    try {
      const devices = await this.platform.discoverDeviceIps();
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
      enableOscillationWhenActivating: config.enableOscillationWhenActivating,
      enableNightModeWhenActivating: config.enableNightModeWhenActivating,
      isNightModeEnabled: config.isNightModeEnabled,
      isJetFocusEnabled: config.isJetFocusEnabled,
      isContinuousMonitoringEnabled: config.isContinuousMonitoringEnabled,
      isFilterStatusDisabled: config.isFilterStatusDisabled,
      isHumidifierDisabled: config.isHumidifierDisabled,
    };
  }

  /**
   * Disconnect from the Dyson device
   */
  async disconnect(): Promise<void> {
    this.isIntentionalDisconnect = true;
    clearTimeout(this.offlineRetryTimer);

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
