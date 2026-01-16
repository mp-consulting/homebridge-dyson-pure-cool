/**
 * Humidity Service Handler
 *
 * Implements the HomeKit HumiditySensor service for Dyson devices.
 * Humidity is reported directly as a percentage (no conversion needed).
 */

import type {
  API,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { DysonDevice } from '../../devices/dysonDevice.js';
import type { DeviceState } from '../../devices/types.js';

/**
 * Configuration for HumidityService
 */
export interface HumidityServiceConfig {
  accessory: PlatformAccessory;
  device: DysonDevice;
  api: API;
  log: Logging;
  /** Humidity offset (can be positive or negative) */
  humidityOffset?: number;
}

/**
 * HumidityService handles the HumiditySensor HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - CurrentRelativeHumidity (0-100%) ↔ humidity (0-100%)
 */
export class HumidityService {
  private readonly service: Service;
  private readonly device: DysonDevice;
  private readonly log: Logging;
  private readonly api: API;
  private readonly humidityOffset: number;

  constructor(config: HumidityServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;
    this.humidityOffset = config.humidityOffset ?? 0;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the HumiditySensor service
    this.service = config.accessory.getService(Service.HumiditySensor) ||
      config.accessory.addService(Service.HumiditySensor);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      'Humidity',
    );

    // Set up CurrentRelativeHumidity characteristic (required)
    this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleHumidityGet.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('HumidityService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle CurrentRelativeHumidity GET request
   * Returns humidity as percentage
   */
  private handleHumidityGet(): CharacteristicValue {
    const state = this.device.getState();
    const humidity = this.getHumidity(state.humidity);
    this.log.debug('Get Humidity ->', humidity, '%');
    return humidity;
  }

  /**
   * Get humidity value with offset and default fallback
   *
   * @param humidity - Humidity percentage from device
   * @returns Humidity percentage (0-100) with offset applied, or 50 if unavailable
   */
  private getHumidity(humidity: number | undefined): number {
    if (humidity === undefined || humidity < 0 || humidity > 100) {
      // Return a sensible default when sensor data unavailable
      return Math.max(0, Math.min(100, 50 + this.humidityOffset));
    }
    // Apply offset and clamp to 0-100 range
    return Math.max(0, Math.min(100, humidity + this.humidityOffset));
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristic to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    const humidity = this.getHumidity(state.humidity);
    this.log.debug('Humidity state changed ->', humidity, '%');

    const Characteristic = this.api.hap.Characteristic;
    this.service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, humidity);
  }

  /**
   * Update characteristic from current device state
   * Call this after connecting to sync HomeKit with device
   */
  updateFromState(): void {
    const state = this.device.getState();
    this.handleStateChange(state);
  }
}
