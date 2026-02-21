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
    // Store options BEFORE calling super(), because super() calls setupServices()
    // which needs access to options. Field initializers run before super() in the
    // JS runtime, so we can use Object.defineProperty to set it before super() runs.
    // However, the simplest correct approach: store on the accessory context.
    //
    // We store options in the accessory context so setupServices() can access them,
    // since TypeScript prevents assigning to `this` before `super()`.
    config.accessory.context._deviceOptions = config.options ?? {};

    // Pass to parent - the base class will call setupServices()
    super(config as DysonAccessoryConfig);

    // Also store as instance field for other methods
    this.options = config.accessory.context._deviceOptions as DeviceOptions;
  }

  /**
   * Set up device-specific services based on device features
   *
   * Creates all HomeKit services based on device features.
   */
  protected setupServices(): void {
    const linkDevice = this.device as DysonLinkDevice;
    const features = linkDevice.getFeatures();
    // Read options from accessory context (set before super() call) to ensure
    // they're available even though setupServices() is called during construction
    const opts: DeviceOptions = (this.accessory.context._deviceOptions as DeviceOptions) ?? this.options ?? {};
    const deviceName = this.accessory.displayName;

    // Create FanService for fan control (all devices) - this is the primary service
    this.fanService = new FanService({
      accessory: this.accessory,
      device: linkDevice,
      api: this.api,
      log: this.log,
      deviceName,
    });

    // Get the primary service for linking secondary services
    const primaryService = this.fanService.getService();

    // Create TemperatureService if device supports it and not ignored
    if (features.temperatureSensor && !opts.isTemperatureIgnored) {
      this.temperatureService = new TemperatureService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
        temperatureOffset: opts.temperatureOffset,
        useFahrenheit: opts.useFahrenheit,
        primaryService,
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
        primaryService,
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
        primaryService,
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
        primaryService,
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
        basicAirQualitySensor: features.basicAirQualitySensor,
        primaryService,
      });
    }

    // Create FilterService if device has filters
    if (features.hepaFilter || features.carbonFilter) {
      this.filterService = new FilterService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
        primaryService,
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
          primaryService,
        });
      }

      // Create Thermostat if requested (default behavior, matches reference plugin)
      if (heatingServiceType === 'thermostat' || heatingServiceType === 'both') {
        this.thermostatService = new ThermostatService({
          accessory: this.accessory,
          device: linkDevice,
          api: this.api,
          log: this.log,
          primaryService,
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
        primaryService,
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
        primaryService,
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
   * Clean up all service event listeners
   */
  override destroy(): void {
    this.fanService?.destroy();
    this.temperatureService?.destroy();
    this.humidityService?.destroy();
    this.nightModeService?.destroy();
    this.continuousMonitoringService?.destroy();
    this.airQualityService?.destroy();
    this.filterService?.destroy();
    this.thermostatService?.destroy();
    this.humidifierControlService?.destroy();
    this.jetFocusService?.destroy();
    this.heaterCoolerService?.destroy();
    super.destroy();
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
