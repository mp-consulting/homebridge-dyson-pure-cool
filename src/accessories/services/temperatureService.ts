/**
 * Temperature Service Handler
 *
 * Implements the HomeKit TemperatureSensor service for Dyson devices.
 * Converts Dyson temperature format (Kelvin × 10) to Celsius.
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
 * Configuration for TemperatureService
 */
export interface TemperatureServiceConfig {
  accessory: PlatformAccessory;
  device: DysonDevice;
  api: API;
  log: Logging;
}

/**
 * TemperatureService handles the TemperatureSensor HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - CurrentTemperature (Celsius) ↔ temperature (Kelvin × 10)
 */
export class TemperatureService {
  private readonly service: Service;
  private readonly device: DysonDevice;
  private readonly log: Logging;
  private readonly api: API;

  constructor(config: TemperatureServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the TemperatureSensor service
    this.service = config.accessory.getService(Service.TemperatureSensor) ||
      config.accessory.addService(Service.TemperatureSensor);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      `${config.accessory.displayName} Temperature`,
    );

    // Set up CurrentTemperature characteristic (required)
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleTemperatureGet.bind(this))
      .setProps({
        minValue: -40,
        maxValue: 100,
        minStep: 0.1,
      });

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('TemperatureService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle CurrentTemperature GET request
   * Returns temperature in Celsius
   */
  private handleTemperatureGet(): CharacteristicValue {
    const state = this.device.getState();
    const celsius = this.convertTemperature(state.temperature);
    this.log.debug('Get Temperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Convert Dyson temperature (Kelvin × 10) to Celsius
   *
   * @param kelvinTimes10 - Temperature in Kelvin × 10 (e.g., 2950 = 295K = 21.85°C)
   * @returns Temperature in Celsius, or 0 if invalid
   */
  private convertTemperature(kelvinTimes10: number | undefined): number {
    if (kelvinTimes10 === undefined || kelvinTimes10 <= 0) {
      // Return a sensible default when sensor data unavailable
      return 20;
    }

    // Dyson reports temperature as Kelvin × 10
    // Formula: (kelvin / 10) - 273.15 = Celsius
    const celsius = (kelvinTimes10 / 10) - 273.15;

    // Round to 1 decimal place
    return Math.round(celsius * 10) / 10;
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristic to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    const celsius = this.convertTemperature(state.temperature);
    this.log.debug('Temperature state changed ->', celsius, '°C');

    const Characteristic = this.api.hap.Characteristic;
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, celsius);
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
