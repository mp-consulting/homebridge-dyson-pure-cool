/**
 * Heater Cooler Service Handler
 *
 * Implements the HomeKit HeaterCooler service for HP-series Dyson devices.
 * Supports heating control with target temperature.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { MessageCodec } from '../../protocol/messageCodec.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/** Initial HeatingThresholdTemperature before the device reports one (°C) */
const DEFAULT_THRESHOLD_CELSIUS = 20;

/**
 * Heating threshold temperature range (°C)
 * HomeKit standard range to avoid Home app issues
 */
const HEATING_TEMP_RANGE = {
  MIN: 10,
  MAX: 38,
  STEP: 1,
};

/**
 * Current temperature sensor range (°C)
 */
const CURRENT_TEMP_RANGE = {
  MIN: -40,
  MAX: 100,
  STEP: 0.1,
};

/**
 * Tolerance for determining heating state (°C)
 * If current temp is below target by this amount, device is actively heating
 */
const HEATING_TOLERANCE_CELSIUS = 0.5;

/** HomeKit CurrentHeaterCoolerState values */
const CURRENT_STATE = {
  INACTIVE: 0,
  IDLE: 1,
  HEATING: 2,
  COOLING: 3,
} as const;

/** HomeKit TargetHeaterCoolerState values */
const TARGET_STATE = {
  AUTO: 0,
  HEAT: 1,
  COOL: 2,
} as const;

/**
 * Configuration for HeaterCoolerService
 */
export type HeaterCoolerServiceConfig = BaseServiceConfig<DysonLinkDevice>;

/**
 * HeaterCoolerService handles the HeaterCooler HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - Active (0/1) ↔ isOn (boolean)
 * - CurrentHeaterCoolerState (INACTIVE/IDLE/HEATING/COOLING)
 * - TargetHeaterCoolerState (AUTO/HEAT/COOL) ↔ heatingEnabled
 * - CurrentTemperature ↔ temperature
 * - HeatingThresholdTemperature ↔ targetTemperature
 */
export class HeaterCoolerService extends BaseService<DysonLinkDevice> {
  constructor(config: HeaterCoolerServiceConfig) {
    super(config, {
      type: config.api.hap.Service.HeaterCooler,
      name: 'Heater',
      subtype: 'heater-cooler',
    });

    const Characteristic = this.api.hap.Characteristic;

    // Set up Active characteristic (required)
    this.service.getCharacteristic(Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    // Set up CurrentHeaterCoolerState characteristic (required, read-only)
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleCurrentStateGet.bind(this));

    // Set up TargetHeaterCoolerState characteristic (required)
    // Only support HEAT mode since Dyson HP devices don't have active cooling
    // On/off is controlled via the Active characteristic, not TargetHeaterCoolerState
    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [TARGET_STATE.HEAT],
      })
      .onGet(this.handleTargetStateGet.bind(this));

    // Set up CurrentTemperature characteristic (required)
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this))
      .setProps({
        minValue: CURRENT_TEMP_RANGE.MIN,
        maxValue: CURRENT_TEMP_RANGE.MAX,
        minStep: CURRENT_TEMP_RANGE.STEP,
      });

    // Set up HeatingThresholdTemperature characteristic
    // HomeKit standard range is 10-38°C to avoid Home app issues
    // Set initial value within range before setting props to avoid warning
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .updateValue(DEFAULT_THRESHOLD_CELSIUS)
      .setProps({
        minValue: HEATING_TEMP_RANGE.MIN,
        maxValue: HEATING_TEMP_RANGE.MAX,
        minStep: HEATING_TEMP_RANGE.STEP,
      })
      .onGet(this.handleHeatingThresholdGet.bind(this))
      .onSet(this.handleHeatingThresholdSet.bind(this));

    this.log.debug('HeaterCoolerService initialized for', config.accessory.displayName);
  }

  /**
   * Handle Active GET request
   * Returns 1 (ACTIVE) or 0 (INACTIVE)
   */
  private handleActiveGet(): CharacteristicValue {
    this.assertConnected();
    const active = this.getActive(this.device.getState());
    this.log.debug('Get Heater Active ->', active);
    return active;
  }

  /**
   * Handle Active SET request
   * @param value - 1 (ACTIVE) or 0 (INACTIVE)
   */
  private async handleActiveSet(value: CharacteristicValue): Promise<void> {
    const active = value === 1;
    this.log.debug('Set Heater Active ->', active);

    await this.runCommand('set heater active', async () => {
      if (active) {
        // Turn on heating mode and make sure the fan runs. Both are queued in
        // the same tick so they go out as a single MQTT command.
        const commands = [this.device.setHeating(true)];
        if (!this.device.getState().isOn) {
          commands.push(this.device.setFanPower(true));
        }
        await Promise.all(commands);
      } else {
        // Turn off heating mode (fan may stay on)
        await this.device.setHeating(false);
      }
    });
  }

  /**
   * Handle CurrentHeaterCoolerState GET request
   * Returns current operational state
   */
  private handleCurrentStateGet(): CharacteristicValue {
    this.assertConnected();
    const currentState = this.getCurrentState(this.device.getState());
    this.log.debug('Get CurrentHeaterCoolerState ->', currentState);
    return currentState;
  }

  /**
   * Handle TargetHeaterCoolerState GET request
   * Always returns HEAT since that's the only supported mode
   * On/off is controlled via Active characteristic
   */
  private handleTargetStateGet(): CharacteristicValue {
    this.log.debug('Get TargetHeaterCoolerState -> HEAT');
    return TARGET_STATE.HEAT;
  }

  /**
   * Handle CurrentTemperature GET request
   * Returns current room temperature in Celsius
   */
  private handleCurrentTemperatureGet(): CharacteristicValue {
    this.assertConnected();
    const celsius = MessageCodec.decodeCelsius(this.device.getState().temperature);
    if (celsius === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.CurrentTemperature);
    }
    this.log.debug('Get CurrentTemperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle HeatingThresholdTemperature GET request
   * Returns target temperature in Celsius
   */
  private handleHeatingThresholdGet(): CharacteristicValue {
    this.assertConnected();
    const celsius = this.convertTargetTemperature(this.device.getState().targetTemperature);
    if (celsius === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.HeatingThresholdTemperature);
    }
    this.log.debug('Get HeatingThreshold ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle HeatingThresholdTemperature SET request
   * @param value - Target temperature in Celsius
   */
  private async handleHeatingThresholdSet(value: CharacteristicValue): Promise<void> {
    const celsius = value as number;
    this.log.debug('Set HeatingThreshold ->', celsius, '°C');
    await this.runCommand('set target temperature', () => this.device.setTargetTemperature(celsius));
  }

  private getActive(state: DeviceState): number {
    // Active means fan is on AND heating is enabled
    return state.isOn && state.heatingEnabled ? 1 : 0;
  }

  /**
   * Heating when the room is below target, idle otherwise. Without
   * temperature readings the heater is assumed to be heating.
   */
  private getCurrentState(state: DeviceState): number {
    if (!state.isOn || !state.heatingEnabled) {
      return CURRENT_STATE.INACTIVE;
    }
    const currentTemp = MessageCodec.decodeCelsius(state.temperature);
    const targetTemp = this.convertTargetTemperature(state.targetTemperature);
    if (currentTemp === undefined || targetTemp === undefined) {
      return CURRENT_STATE.HEATING;
    }
    return currentTemp < targetTemp - HEATING_TOLERANCE_CELSIUS
      ? CURRENT_STATE.HEATING
      : CURRENT_STATE.IDLE;
  }

  /**
   * Convert Dyson target temperature (Kelvin × 10) to whole degrees Celsius
   * within the characteristic range, or undefined if not reported
   */
  private convertTargetTemperature(kelvinTimes10: number | undefined): number | undefined {
    const celsius = MessageCodec.decodeCelsius(kelvinTimes10);
    if (celsius === undefined) {
      return undefined;
    }
    return Math.max(HEATING_TEMP_RANGE.MIN, Math.min(HEATING_TEMP_RANGE.MAX, Math.round(celsius)));
  }

  protected handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    // Active (on/off is controlled here, not via TargetHeaterCoolerState)
    this.update(Characteristic.Active, this.getActive(state));
    this.update(Characteristic.CurrentHeaterCoolerState, this.getCurrentState(state));

    const celsius = MessageCodec.decodeCelsius(state.temperature);
    if (celsius !== undefined) {
      this.update(Characteristic.CurrentTemperature, celsius);
    }

    const targetCelsius = this.convertTargetTemperature(state.targetTemperature);
    if (targetCelsius !== undefined) {
      this.update(Characteristic.HeatingThresholdTemperature, targetCelsius);
    }
  }
}
