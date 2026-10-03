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
import type { BaseService } from './services/baseService.js';

/**
 * Subtypes of the optional services this accessory manages. A cached service
 * with one of these subtypes that is no longer enabled gets removed.
 */
const OPTIONAL_SERVICE_SUBTYPES = new Set([
  'temperature-sensor',
  'humidity-sensor',
  'night-mode',
  'continuous-monitoring',
  'air-quality-sensor',
  'filter-maintenance',
  'thermostat',
  'heater-cooler',
  'humidifier',
  'jet-focus',
]);

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

  // Display options
  /** Use Fahrenheit for temperature display */
  useFahrenheit?: boolean;

  // Heating options (HP models)
  /** Disable heating controls */
  isHeatingDisabled?: boolean;
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

  // Activation behaviour
  /** Enable auto mode automatically when the device is turned on */
  enableAutoModeWhenActivating?: boolean;
  /** Enable oscillation automatically when the device is turned on */
  enableOscillationWhenActivating?: boolean;
  /** Enable night mode automatically when the device is turned on */
  enableNightModeWhenActivating?: boolean;

  // Service toggles
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
 * Configuration for DysonLinkAccessory
 */
export interface DysonLinkAccessoryConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
  /** Device-specific options */
  options?: DeviceOptions;
  /** Firmware version reported by the Dyson cloud, if known */
  firmwareVersion?: string;
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

  private readonly options: DeviceOptions;

  /**
   * Create a new DysonLinkAccessory
   *
   * @param config - Accessory configuration
   */
  constructor(config: DysonLinkAccessoryConfig) {
    super(config as DysonAccessoryConfig);
    this.options = config.options ?? {};
    this.setupServices();
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
    const opts = this.options;
    const deviceName = this.accessory.displayName;

    // Modes to switch on automatically whenever the device is activated.
    // The device layer applies these on off -> on transitions only, and gates
    // each one on the model's catalog features.
    linkDevice.setActivationDefaults({
      autoMode: opts.enableAutoModeWhenActivating,
      oscillation: opts.enableOscillationWhenActivating,
      nightMode: opts.enableNightModeWhenActivating,
    });

    // Create FanService for fan control (all devices) - this is the primary service
    this.fanService = new FanService({
      accessory: this.accessory,
      device: linkDevice,
      api: this.api,
      log: this.log,
      deviceName,
      supportsAutoMode: features.autoMode,
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

    // Create FilterService if device has filters and not disabled
    if ((features.hepaFilter || features.carbonFilter) && !opts.isFilterStatusDisabled) {
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

    // Create HumidifierControlService for PH models (if not disabled)
    if (features.humidifier && !opts.isHumidifierDisabled) {
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

    this.removeDisabledServices();

    this.log.debug('DysonLinkAccessory services configured');
  }

  /**
   * All service handlers currently active on this accessory
   */
  private getServiceHandlers(): BaseService[] {
    return [
      this.fanService,
      this.temperatureService,
      this.humidityService,
      this.nightModeService,
      this.continuousMonitoringService,
      this.airQualityService,
      this.filterService,
      this.thermostatService,
      this.humidifierControlService,
      this.jetFocusService,
      this.heaterCoolerService,
    ].filter((handler): handler is NonNullable<typeof handler> => handler !== undefined);
  }

  /**
   * Remove cached HomeKit services whose feature was disabled in the config
   * (or that the device no longer supports), so they don't linger in the
   * Home app without handlers.
   */
  private removeDisabledServices(): void {
    const active = new Set(this.getServiceHandlers().map((handler) => handler.getService()));
    for (const service of [...this.accessory.services]) {
      if (service.subtype && OPTIONAL_SERVICE_SUBTYPES.has(service.subtype) && !active.has(service)) {
        this.log.info(`Removing disabled service "${service.displayName}" from`, this.accessory.displayName);
        this.removeService(service);
      }
    }
  }

  /**
   * Handle device connection
   *
   * When device reconnects, sync HomeKit state with device.
   */
  protected handleConnect(): void {
    super.handleConnect();
    // Sync HomeKit state with device state after reconnection
    for (const handler of this.getServiceHandlers()) {
      handler.updateFromState();
    }
    this.log.info('DysonLinkAccessory: Device reconnected, state synced');
  }

  /**
   * Clean up all service event listeners
   */
  override destroy(): void {
    for (const handler of this.getServiceHandlers()) {
      handler.destroy();
    }
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
