/**
 * Humidity Service Handler
 *
 * Implements the HomeKit HumiditySensor service for Dyson devices.
 * Reports relative humidity percentage.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonDevice } from '../../devices/dysonDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Humidity range constants
 */
const HUMIDITY = {
  MIN: 0,
  MAX: 100,
  STEP: 1,
} as const;

/**
 * Configuration for HumidityService
 */
export interface HumidityServiceConfig extends BaseServiceConfig<DysonDevice> {
  /** Humidity offset percentage (can be positive or negative) */
  humidityOffset?: number;
}

/**
 * HumidityService handles the HumiditySensor HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - CurrentRelativeHumidity (0-100%) ↔ humidity (0-100%)
 */
export class HumidityService extends BaseService<DysonDevice> {
  private readonly humidityOffset: number;

  constructor(config: HumidityServiceConfig) {
    super(config, {
      type: config.api.hap.Service.HumiditySensor,
      name: 'Humidity',
      subtype: 'humidity-sensor',
    });
    this.humidityOffset = config.humidityOffset ?? 0;

    // Set up CurrentRelativeHumidity characteristic (required)
    this.service.getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleHumidityGet.bind(this))
      .setProps({
        minValue: HUMIDITY.MIN,
        maxValue: HUMIDITY.MAX,
        minStep: HUMIDITY.STEP,
      });

    this.log.debug('HumidityService initialized for', config.accessory.displayName);
  }

  /**
   * Handle CurrentRelativeHumidity GET request.
   * Returns the last value HomeKit has while the sensor has no reading.
   */
  private handleHumidityGet(): CharacteristicValue {
    this.assertConnected();
    const humidity = this.getHumidity(this.device.getState().humidity);
    if (humidity === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.CurrentRelativeHumidity);
    }
    this.log.debug('Get Humidity ->', humidity, '%');
    return humidity;
  }

  /**
   * Apply the offset and clamp to 0-100. Undefined if there is no valid reading.
   */
  private getHumidity(humidity: number | undefined): number | undefined {
    if (humidity === undefined || !Number.isFinite(humidity) || humidity < HUMIDITY.MIN || humidity > HUMIDITY.MAX) {
      return undefined;
    }
    return Math.max(HUMIDITY.MIN, Math.min(HUMIDITY.MAX, humidity + this.humidityOffset));
  }

  protected handleStateChange(state: DeviceState): void {
    const humidity = this.getHumidity(state.humidity);
    if (humidity === undefined) {
      return;
    }
    this.log.debug('Humidity state changed ->', humidity, '%');
    this.update(this.api.hap.Characteristic.CurrentRelativeHumidity, humidity);
  }
}
