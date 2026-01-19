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
 * Humidity characteristic range and defaults
 */
const HUMIDITY = {
  MIN: 0,
  MAX: 100,
  STEP: 1,
  /** Default value when sensor data is unavailable */
  DEFAULT_FALLBACK: 50,
} as const;

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
  /** Primary service to link this service to */
  primaryService?: Service;
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

    // Get or create the HumiditySensor service with name
    this.service = config.accessory.getService('humidity-sensor') ||
      config.accessory.addService(Service.HumiditySensor, 'Humidity', 'humidity-sensor');

    // Set ConfiguredName for better HomeKit display
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.updateCharacteristic(Characteristic.ConfiguredName, 'Humidity');

    // Set up CurrentRelativeHumidity characteristic (required)
    this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleHumidityGet.bind(this))
      .setProps({
        minValue: HUMIDITY.MIN,
        maxValue: HUMIDITY.MAX,
        minStep: HUMIDITY.STEP,
      });

    // Link to primary service if provided
    if (config.primaryService) {
      this.service.addLinkedService(config.primaryService);
    }

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
   * @returns Humidity percentage (0-100) with offset applied, or default if unavailable
   */
  private getHumidity(humidity: number | undefined): number {
    if (humidity === undefined || humidity < HUMIDITY.MIN || humidity > HUMIDITY.MAX) {
      // Return a sensible default when sensor data unavailable
      return Math.max(HUMIDITY.MIN, Math.min(HUMIDITY.MAX, HUMIDITY.DEFAULT_FALLBACK + this.humidityOffset));
    }
    // Apply offset and clamp to valid range
    return Math.max(HUMIDITY.MIN, Math.min(HUMIDITY.MAX, humidity + this.humidityOffset));
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
