/**
 * Thermostat Service Handler
 *
 * Implements the HomeKit Thermostat service for Dyson Hot+Cool devices.
 * Provides heating control with target temperature setting.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { HEATING_TEMP, MessageCodec } from '../../protocol/messageCodec.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for ThermostatService
 */
export type ThermostatServiceConfig = BaseServiceConfig<DysonLinkDevice>;

/**
 * Temperature limits for Dyson heaters
 */
const TEMP_MIN = HEATING_TEMP.MIN_CELSIUS;
const TEMP_MAX = HEATING_TEMP.MAX_CELSIUS;

/** CurrentTemperature characteristic range (Celsius) */
const CURRENT_TEMP_RANGE = {
  MIN: -40,
  MAX: 100,
  STEP: 0.1,
} as const;

/** HomeKit heating/cooling state values used by Dyson (no cooling) */
const HEATING_STATE = {
  OFF: 0,
  HEAT: 1,
} as const;

/**
 * ThermostatService handles the HomeKit Thermostat service for HP models
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - CurrentHeatingCoolingState: OFF (0) or HEAT (1) based on heatingEnabled
 * - TargetHeatingCoolingState: OFF (0) or HEAT (1) for control
 * - CurrentTemperature: Current room temperature
 * - TargetTemperature: Target heating temperature
 */
export class ThermostatService extends BaseService<DysonLinkDevice> {
  constructor(config: ThermostatServiceConfig) {
    super(config, {
      type: config.api.hap.Service.Thermostat,
      name: 'Thermostat',
      subtype: 'thermostat',
    });

    const Characteristic = this.api.hap.Characteristic;

    // Set up CurrentHeatingCoolingState (read-only)
    // Values: OFF (0), HEAT (1), COOL (2), AUTO (3)
    // Dyson only supports OFF and HEAT
    this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentStateGet.bind(this));

    // Set up TargetHeatingCoolingState (controllable)
    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetStateGet.bind(this))
      .onSet(this.handleTargetStateSet.bind(this))
      .setProps({
        validValues: [
          Characteristic.TargetHeatingCoolingState.OFF,
          Characteristic.TargetHeatingCoolingState.HEAT,
        ],
      });

    // Set up CurrentTemperature (read-only)
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTempGet.bind(this))
      .setProps({
        minValue: CURRENT_TEMP_RANGE.MIN,
        maxValue: CURRENT_TEMP_RANGE.MAX,
        minStep: CURRENT_TEMP_RANGE.STEP,
      });

    // Set up TargetTemperature (controllable)
    this.service.getCharacteristic(Characteristic.TargetTemperature)
      .onGet(this.handleTargetTempGet.bind(this))
      .onSet(this.handleTargetTempSet.bind(this))
      .setProps({
        minValue: TEMP_MIN,
        maxValue: TEMP_MAX,
        minStep: 1,
      });

    // Set temperature display units (Celsius)
    this.service.setCharacteristic(
      Characteristic.TemperatureDisplayUnits,
      Characteristic.TemperatureDisplayUnits.CELSIUS,
    );

    this.log.debug('ThermostatService initialized for', config.accessory.displayName);
  }

  /**
   * Handle CurrentHeatingCoolingState GET request
   */
  private handleCurrentStateGet(): CharacteristicValue {
    this.assertConnected();
    const value = this.getHeatingState(this.device.getState());
    this.log.debug('Get CurrentHeatingCoolingState ->', value);
    return value;
  }

  /**
   * Handle TargetHeatingCoolingState GET request
   */
  private handleTargetStateGet(): CharacteristicValue {
    this.assertConnected();
    const value = this.getHeatingState(this.device.getState());
    this.log.debug('Get TargetHeatingCoolingState ->', value);
    return value;
  }

  /**
   * Handle TargetHeatingCoolingState SET request
   */
  private async handleTargetStateSet(value: CharacteristicValue): Promise<void> {
    const heating = value === HEATING_STATE.HEAT;
    this.log.debug('Set TargetHeatingCoolingState ->', heating ? 'HEAT' : 'OFF');
    await this.runCommand('set heating mode', () => this.device.setHeating(heating));
  }

  /**
   * Handle CurrentTemperature GET request
   */
  private handleCurrentTempGet(): CharacteristicValue {
    this.assertConnected();
    const celsius = MessageCodec.decodeCelsius(this.device.getState().temperature);
    if (celsius === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.CurrentTemperature);
    }
    this.log.debug('Get CurrentTemperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle TargetTemperature GET request
   */
  private handleTargetTempGet(): CharacteristicValue {
    this.assertConnected();
    const celsius = this.convertTargetTemperature(this.device.getState().targetTemperature);
    if (celsius === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.TargetTemperature);
    }
    this.log.debug('Get TargetTemperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle TargetTemperature SET request
   */
  private async handleTargetTempSet(value: CharacteristicValue): Promise<void> {
    const celsius = value as number;
    this.log.debug('Set TargetTemperature ->', celsius, '°C');
    await this.runCommand('set target temperature', () => this.device.setTargetTemperature(celsius));
  }

  private getHeatingState(state: DeviceState): number {
    return state.heatingEnabled ? HEATING_STATE.HEAT : HEATING_STATE.OFF;
  }

  /**
   * Convert target temperature to an integer Celsius value within the
   * heater's range, or undefined if the device hasn't reported one
   */
  private convertTargetTemperature(kelvinTimes10: number | undefined): number | undefined {
    const celsius = MessageCodec.decodeCelsius(kelvinTimes10);
    if (celsius === undefined) {
      return undefined;
    }
    return Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(celsius)));
  }

  protected handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    const heatingValue = this.getHeatingState(state);
    this.update(Characteristic.CurrentHeatingCoolingState, heatingValue);
    this.update(Characteristic.TargetHeatingCoolingState, heatingValue);

    const currentTemp = MessageCodec.decodeCelsius(state.temperature);
    if (currentTemp !== undefined) {
      this.update(Characteristic.CurrentTemperature, currentTemp);
    }

    const targetTemp = this.convertTargetTemperature(state.targetTemperature);
    if (targetTemp !== undefined) {
      this.update(Characteristic.TargetTemperature, targetTemp);
    }
  }
}
