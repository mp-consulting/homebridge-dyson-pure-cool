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
  /** Temperature offset in Celsius (can be positive or negative) */
  temperatureOffset?: number;
  /** Use Fahrenheit for logging (HomeKit always uses Celsius internally) */
  useFahrenheit?: boolean;
  /** Primary service to link this service to */
  primaryService?: Service;
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
  private readonly temperatureOffset: number;
  private readonly useFahrenheit: boolean;

  constructor(config: TemperatureServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;
    this.temperatureOffset = config.temperatureOffset ?? 0;
    this.useFahrenheit = config.useFahrenheit ?? false;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the TemperatureSensor service with name
    this.service = config.accessory.getService('temperature-sensor') ||
      config.accessory.addService(Service.TemperatureSensor, 'Temperature', 'temperature-sensor');

    // Set ConfiguredName for better HomeKit display
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.updateCharacteristic(Characteristic.ConfiguredName, 'Temperature');

    // Set up CurrentTemperature characteristic (required)
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleTemperatureGet.bind(this))
      .setProps({
        minValue: -40,
        maxValue: 100,
        minStep: 0.1,
      });

    // Link to primary service if provided
    if (config.primaryService) {
      this.service.addLinkedService(config.primaryService);
    }

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
   * Returns temperature in Celsius (HomeKit standard)
   */
  private handleTemperatureGet(): CharacteristicValue {
    const state = this.device.getState();
    const celsius = this.convertTemperature(state.temperature);
    this.logTemperature('Get Temperature ->', celsius);
    return celsius;
  }

  /**
   * Log temperature in configured unit
   */
  private logTemperature(message: string, celsius: number): void {
    if (this.useFahrenheit) {
      const fahrenheit = Math.round((celsius * 9 / 5 + 32) * 10) / 10;
      this.log.debug(message, fahrenheit, '°F');
    } else {
      this.log.debug(message, celsius, '°C');
    }
  }

  /**
   * Convert Dyson temperature (Kelvin × 10) to Celsius with offset
   *
   * @param kelvinTimes10 - Temperature in Kelvin × 10 (e.g., 2950 = 295K = 21.85°C)
   * @returns Temperature in Celsius with offset applied, or default if invalid
   */
  private convertTemperature(kelvinTimes10: number | undefined): number {
    if (kelvinTimes10 === undefined || kelvinTimes10 <= 0) {
      // Return a sensible default when sensor data unavailable
      return 20 + this.temperatureOffset;
    }

    // Dyson reports temperature as Kelvin × 10
    // Formula: (kelvin / 10) - 273.15 = Celsius
    const celsius = (kelvinTimes10 / 10) - 273.15;

    // Apply offset and round to 1 decimal place
    return Math.round((celsius + this.temperatureOffset) * 10) / 10;
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristic to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    const celsius = this.convertTemperature(state.temperature);
    this.logTemperature('Temperature state changed ->', celsius);

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
