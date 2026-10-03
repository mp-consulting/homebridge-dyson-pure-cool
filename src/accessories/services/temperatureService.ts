/**
 * Temperature Service Handler
 *
 * Implements the HomeKit TemperatureSensor service for Dyson devices.
 * Converts Dyson temperature format (Kelvin × 10) to Celsius.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonDevice } from '../../devices/dysonDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { MessageCodec } from '../../protocol/messageCodec.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/** CurrentTemperature characteristic range (Celsius) */
const TEMPERATURE_RANGE = {
  MIN: -40,
  MAX: 100,
  STEP: 0.1,
} as const;

/**
 * Configuration for TemperatureService
 */
export interface TemperatureServiceConfig extends BaseServiceConfig<DysonDevice> {
  /** Temperature offset in Celsius (can be positive or negative) */
  temperatureOffset?: number;
  /** Use Fahrenheit for logging (HomeKit always uses Celsius internally) */
  useFahrenheit?: boolean;
}

/**
 * TemperatureService handles the TemperatureSensor HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - CurrentTemperature (Celsius) ↔ temperature (Kelvin × 10)
 */
export class TemperatureService extends BaseService<DysonDevice> {
  private readonly temperatureOffset: number;
  private readonly useFahrenheit: boolean;

  constructor(config: TemperatureServiceConfig) {
    super(config, {
      type: config.api.hap.Service.TemperatureSensor,
      name: 'Temperature',
      subtype: 'temperature-sensor',
    });
    this.temperatureOffset = config.temperatureOffset ?? 0;
    this.useFahrenheit = config.useFahrenheit ?? false;

    // Set up CurrentTemperature characteristic (required)
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
      .onGet(this.handleTemperatureGet.bind(this))
      .setProps({
        minValue: TEMPERATURE_RANGE.MIN,
        maxValue: TEMPERATURE_RANGE.MAX,
        minStep: TEMPERATURE_RANGE.STEP,
      });

    this.log.debug('TemperatureService initialized for', config.accessory.displayName);
  }

  /**
   * Handle CurrentTemperature GET request.
   * Returns the last value HomeKit has while the sensor has no reading.
   */
  private handleTemperatureGet(): CharacteristicValue {
    this.assertConnected();
    const celsius = this.convertTemperature(this.device.getState().temperature);
    if (celsius === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.CurrentTemperature);
    }
    this.logTemperature('Get Temperature ->', celsius);
    return celsius;
  }

  /**
   * Log temperature in the user's preferred unit
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
   * Convert Dyson temperature (Kelvin × 10) to Celsius with the configured
   * offset, clamped to the characteristic range. Undefined if no reading.
   */
  private convertTemperature(kelvinTimes10: number | undefined): number | undefined {
    const celsius = MessageCodec.decodeCelsius(kelvinTimes10);
    if (celsius === undefined) {
      return undefined;
    }
    const adjusted = Math.round((celsius + this.temperatureOffset) * 10) / 10;
    return Math.max(TEMPERATURE_RANGE.MIN, Math.min(TEMPERATURE_RANGE.MAX, adjusted));
  }

  protected handleStateChange(state: DeviceState): void {
    const celsius = this.convertTemperature(state.temperature);
    if (celsius === undefined) {
      return;
    }
    this.logTemperature('Temperature state changed ->', celsius);
    this.update(this.api.hap.Characteristic.CurrentTemperature, celsius);
  }
}
