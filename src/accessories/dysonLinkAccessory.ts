/**
 * Dyson Link Accessory
 *
 * HomeKit accessory handler for Dyson Link series devices.
 * Supports HP02 (455), TP04 (438), and TP07 (438E).
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
import type { DysonLinkDevice } from '../devices/dysonLinkDevice.js';
import type { DeviceState } from '../devices/types.js';

/**
 * Configuration for DysonLinkAccessory
 */
export interface DysonLinkAccessoryConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * DysonLinkAccessory handles HomeKit integration for Link series devices
 *
 * Features:
 * - Fan control (power, speed, oscillation)
 * - Temperature sensor
 * - Humidity sensor
 * - Air quality sensors (PM2.5, PM10, VOC)
 * - Filter maintenance status
 * - Night mode and continuous monitoring switches
 */
export class DysonLinkAccessory extends DysonAccessory {
  private fanService!: FanService;
  private temperatureService?: TemperatureService;
  private humidityService?: HumidityService;
  private nightModeService?: NightModeService;
  private continuousMonitoringService?: ContinuousMonitoringService;
  private airQualityService?: AirQualityService;
  private filterService?: FilterService;

  /**
   * Create a new DysonLinkAccessory
   *
   * @param config - Accessory configuration
   */
  constructor(config: DysonLinkAccessoryConfig) {
    // Pass to parent - the base class will call setupServices()
    super(config as DysonAccessoryConfig);
  }

  /**
   * Set up device-specific services
   *
   * Creates FanService, TemperatureService, and HumidityService.
   */
  protected setupServices(): void {
    const linkDevice = this.device as DysonLinkDevice;
    const features = linkDevice.getFeatures();

    // Create FanService for fan control
    this.fanService = new FanService({
      accessory: this.accessory,
      device: linkDevice,
      api: this.api,
      log: this.log,
    });

    // Create TemperatureService if device supports it
    if (features.temperatureSensor) {
      this.temperatureService = new TemperatureService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create HumidityService if device supports it
    if (features.humiditySensor) {
      this.humidityService = new HumidityService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create NightModeService if device supports it
    if (features.nightMode) {
      this.nightModeService = new NightModeService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create ContinuousMonitoringService if device supports it
    if (features.continuousMonitoring) {
      this.continuousMonitoringService = new ContinuousMonitoringService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
      });
    }

    // Create AirQualityService if device supports it
    if (features.airQualitySensor) {
      this.airQualityService = new AirQualityService({
        accessory: this.accessory,
        device: linkDevice,
        api: this.api,
        log: this.log,
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

    this.log.debug('DysonLinkAccessory services configured');
  }

  /**
   * Handle device state changes
   *
   * FanService handles its own state updates via event subscription,
   * but we can add additional handling here if needed.
   *
   * @param state - New device state
   */
  protected handleStateChange(state: DeviceState): void {
    super.handleStateChange(state);
    // FanService subscribes to stateChange directly, so no need to forward
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
   * Get the AirQualityService instance (if enabled)
   */
  getAirQualityService(): AirQualityService | undefined {
    return this.airQualityService;
  }

  /**
   * Get the FilterService instance (if enabled)
   */
  getFilterService(): FilterService | undefined {
    return this.filterService;
  }
}
