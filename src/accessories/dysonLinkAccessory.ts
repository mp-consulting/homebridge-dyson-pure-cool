/**
 * Dyson Link Accessory
 *
 * HomeKit accessory handler for all Dyson purifier devices.
 * Supports Pure Cool, Hot+Cool, Humidify+Cool, and Big+Quiet models.
 */

import type {
  API,
  Logging,
  PlatformAccessory,
} from 'homebridge';

import { DysonAccessory } from './dysonAccessory.js';
import type { DysonAccessoryConfig } from './dysonAccessory.js';
import { FanService } from './services/fanService.js';
import { TemperatureService } from './services/temperatureService.js';
import { HumidityService } from './services/humidityService.js';
import { NightModeService } from './services/nightModeService.js';
import { ContinuousMonitoringService } from './services/continuousMonitoringService.js';
import { AirQualityService } from './services/airQualityService.js';
import { FilterService } from './services/filterService.js';
import { ThermostatService } from './services/thermostatService.js';
import { HumidifierControlService } from './services/humidifierControlService.js';
import { JetFocusService } from './services/jetFocusService.js';
import { HeaterCoolerService } from './services/heaterCoolerService.js';
import type { DysonLinkDevice } from '../devices/dysonLinkDevice.js';
import type { DeviceState } from '../devices/types.js';

/**
 * Configuration options for device features
 */
export interface DeviceOptions {
  // Sensor calibration
  /** Temperature offset in Celsius */
  temperatureOffset?: number;
  /** Humidity offset percentage */
  humidityOffset?: number;

  // Sensor visibility
  /** Disable temperature sensor */
  isTemperatureIgnored?: boolean;
  /** Disable humidity sensor */
  isHumidityIgnored?: boolean;
  /** Disable air quality sensor */
  isAirQualityIgnored?: boolean;
  /** Show temperature as separate accessory */
  isTemperatureSensorEnabled?: boolean;
  /** Show humidity as separate accessory */
  isHumiditySensorEnabled?: boolean;
  /** Show air quality as separate accessory */
  isAirQualitySensorEnabled?: boolean;

  // Display options
  /** Use Fahrenheit for temperature display */
  useFahrenheit?: boolean;
  /** Combine all services into single accessory */
  isSingleAccessoryModeEnabled?: boolean;
  /** Combine all sensors into single accessory */
  isSingleSensorAccessoryModeEnabled?: boolean;

  // Heating options (HP models)
  /** Disable heating controls */
  isHeatingDisabled?: boolean;
  /** Override heating safety restrictions */
  isHeatingSafetyIgnored?: boolean;
  /**
   * Heating service type to expose in HomeKit
   * - 'thermostat': Traditional Thermostat service (matches reference plugin)
   * - 'heater-cooler': HeaterCooler service (modern HomeKit approach)
   * - 'both': Expose both services (default for backwards compatibility)
   */
  heatingServiceType?: 'thermostat' | 'heater-cooler' | 'both';

  // Humidifier options (PH models)
  /** Enable full humidity range (0-100%) for humidifier */
  fullRangeHumidity?: boolean;

  // Activation behaviors
  /** Enable auto mode on device activation */
  enableAutoModeWhenActivating?: boolean;
  /** Enable oscillation on device activation */
  enableOscillationWhenActivating?: boolean;
  /** Enable night mode on device activation */
  enableNightModeWhenActivating?: boolean;

  // Service toggles
  /** Enable night mode switch */
  isNightModeEnabled?: boolean;
  /** Enable jet focus switch */
  isJetFocusEnabled?: boolean;
  /** Enable continuous monitoring switch */
  isContinuousMonitoringEnabled?: boolean;
}

/**
 * Configuration for DysonLinkAccessory
 */
export interface DysonLinkAccessoryConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
  /** Device-specific options */
  options?: DeviceOptions;
}

/**
 * DysonLinkAccessory handles HomeKit integration for all Dyson purifier devices
 *
 * Features:
 * - Fan control (power, speed, oscillation, auto mode)
 * - Temperature and humidity sensors (with offset support)
 * - Air quality sensors (PM2.5, PM10, VOC, NO2)
 * - Filter maintenance status
 * - Night mode and continuous monitoring switches
 * - Thermostat/HeaterCooler for HP models (heating control)
 * - Humidifier control for PH models
 * - Jet Focus (front airflow) switch
 */
export class DysonLinkAccessory extends DysonAccessory {
  private fanService!: FanService;
  private temperatureService?: TemperatureService;
  private humidityService?: HumidityService;
  private nightModeService?: NightModeService;
  private continuousMonitoringService?: ContinuousMonitoringService;
  private airQualityService?: AirQualityService;
  private filterService?: FilterService;
  private thermostatService?: ThermostatService;
  private humidifierControlService?: HumidifierControlService;
  private jetFocusService?: JetFocusService;
  private heaterCoolerService?: HeaterCoolerService;

  private options: DeviceOptions = {};

  /**
   * Create a new DysonLinkAccessory
   *
   * @param config - Accessory configuration
   */
  constructor(config: DysonLinkAccessoryConfig) {
    // Initialize options before super() call since setupServices() needs them
    // The field initializer runs before super(), making options available
    if (config.options) {
      // Note: We need to set this before super() but after field initialization
      // TypeScript doesn't allow this, so we use a default empty object above
    }
    // Pass to parent - the base class will call setupServices()
    super(config as DysonAccessoryConfig);
    // Update options after super (for any additional processing)
    this.options = config.options ?? {};
  }

  /**
   * Set up device-specific services based on device features
   *
   * Creates all HomeKit services based on device features.
   */
  protected setupServices(): void {
    const linkDevice = this.device as DysonLinkDevice;
    const features = linkDevice.getFeatures();
    const opts = this.options ?? {};

    // Create FanService for fan control (all devices)
    this.fanService = new FanService({
      accessory: this.accessory,
      device: linkDevice,
      api: this.api,
      log: this.log,
    });

    // Create TemperatureService if device supports it and not ignored
    if (features.temperatureSensor && !opts.isTemperatureIgnored) {
      this.temperatureService = new TemperatureService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
        temperatureOffset: opts.temperatureOffset,
        useFahrenheit: opts.useFahrenheit,
      });
    }

    // Create HumidityService if device supports it and not ignored
    if (features.humiditySensor && !opts.isHumidityIgnored) {
      this.humidityService = new HumidityService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
        humidityOffset: opts.humidityOffset,
      });
    }

    // Create NightModeService if device supports it and enabled (default: true)
    const nightModeEnabled = opts.isNightModeEnabled !== false;
    if (features.nightMode && nightModeEnabled) {
      this.nightModeService = new NightModeService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create ContinuousMonitoringService if device supports it and enabled
    const continuousMonitoringEnabled = opts.isContinuousMonitoringEnabled === true;
    if (features.continuousMonitoring && continuousMonitoringEnabled) {
      this.continuousMonitoringService = new ContinuousMonitoringService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create AirQualityService if device supports it and not ignored
    if (features.airQualitySensor && !opts.isAirQualityIgnored) {
      this.airQualityService = new AirQualityService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
        hasNo2Sensor: features.no2Sensor,
      });
    }

    // Create FilterService if device has filters
    if (features.hepaFilter || features.carbonFilter) {
      this.filterService = new FilterService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create heating services for HP-series devices (if heating not disabled)
    // Users can choose between Thermostat, HeaterCooler, or both
    if (features.heating && !opts.isHeatingDisabled) {
      const heatingServiceType = opts.heatingServiceType ?? 'thermostat';

      // Create HeaterCooler if requested
      if (heatingServiceType === 'heater-cooler' || heatingServiceType === 'both') {
        this.heaterCoolerService = new HeaterCoolerService({
          accessory: this.accessory,
          device: linkDevice,
          api: this.api,
          log: this.log,
        });
      }

      // Create Thermostat if requested (default behavior, matches reference plugin)
      if (heatingServiceType === 'thermostat' || heatingServiceType === 'both') {
        this.thermostatService = new ThermostatService({
          accessory: this.accessory,
          device: linkDevice,
          api: this.api,
          log: this.log,
        });
      }
    }

    // Create HumidifierControlService for PH models
    if (features.humidifier) {
      this.humidifierControlService = new HumidifierControlService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
        fullRangeHumidity: opts.fullRangeHumidity,
      });
    }

    // Create JetFocusService if device supports it and enabled (default: true)
    const jetFocusEnabled = opts.isJetFocusEnabled !== false;
    if (features.frontAirflow && jetFocusEnabled) {
      this.jetFocusService = new JetFocusService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    this.log.debug('DysonLinkAccessory services configured');
  }

  /**
   * Handle device state changes
   *
   * Services handle their own state updates via event subscription.
   *
   * @param state - New device state
   */
  protected handleStateChange(state: DeviceState): void {
    super.handleStateChange(state);
    // Services subscribe to stateChange directly, so no need to forward
  }

  /**
   * Handle device disconnection
   *
   * When device disconnects, HomeKit will show "Not Responding"
   * automatically when characteristic gets return errors.
   */
  protected handleDisconnect(): void {
    super.handleDisconnect();
    this.log.warn('DysonLinkAccessory: Device disconnected, HomeKit will show Not Responding');
  }

  /**
   * Handle device connection
   *
   * When device reconnects, sync HomeKit state with device.
   */
  protected handleConnect(): void {
    super.handleConnect();
    // Sync HomeKit state with device state after reconnection
    this.fanService.updateFromState();
    this.temperatureService?.updateFromState();
    this.humidityService?.updateFromState();
    this.nightModeService?.updateFromState();
    this.continuousMonitoringService?.updateFromState();
    this.airQualityService?.updateFromState();
    this.filterService?.updateFromState();
    this.thermostatService?.updateFromState();
    this.humidifierControlService?.updateFromState();
    this.jetFocusService?.updateFromState();
    this.heaterCoolerService?.updateFromState();
    this.log.info('DysonLinkAccessory: Device reconnected, state synced');
  }

  /**
   * Get the FanService instance
   */
  getFanService(): FanService {
    return this.fanService;
  }

  /**
   * Get the TemperatureService instance (if enabled)
   */
  getTemperatureService(): TemperatureService | undefined {
    return this.temperatureService;
  }

  /**
   * Get the HumidityService instance (if enabled)
   */
  getHumidityService(): HumidityService | undefined {
    return this.humidityService;
  }

  /**
   * Get the NightModeService instance (if enabled)
   */
  getNightModeService(): NightModeService | undefined {
    return this.nightModeService;
  }

  /**
   * Get the ContinuousMonitoringService instance (if enabled)
   */
  getContinuousMonitoringService(): ContinuousMonitoringService | undefined {
    return this.continuousMonitoringService;
  }

  /**
   * Get the HeaterCoolerService instance (if enabled)
   */
  getHeaterCoolerService(): HeaterCoolerService | undefined {
    return this.heaterCoolerService;
  }

  /**
   * Get the ThermostatService instance (if device supports heating)
   */
  getThermostatService(): ThermostatService | undefined {
    return this.thermostatService;
  }

  /**
   * Get the HumidifierControlService instance (if device supports humidification)
   */
  getHumidifierControlService(): HumidifierControlService | undefined {
    return this.humidifierControlService;
  }

  /**
   * Get the JetFocusService instance (if device supports jet focus)
   */
  getJetFocusService(): JetFocusService | undefined {
    return this.jetFocusService;
  }

  /**
   * Get the AirQualityService instance (if device supports air quality)
   */
  getAirQualityService(): AirQualityService | undefined {
    return this.airQualityService;
  }

  /**
   * Get the FilterService instance (if device has filters)
   */
  getFilterService(): FilterService | undefined {
    return this.filterService;
  }
}
