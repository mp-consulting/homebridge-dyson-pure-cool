/**
 * Heater Cooler Service Handler
 *
 * Implements the HomeKit HeaterCooler service for HP-series Dyson devices.
 * Supports heating control with target temperature.
 */

import type {
  API,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';

/**
 * Configuration for HeaterCoolerService
 */
export interface HeaterCoolerServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

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
export class HeaterCoolerService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;

  // HomeKit HeaterCooler state constants
  private readonly CURRENT_STATE = {
    INACTIVE: 0,
    IDLE: 1,
    HEATING: 2,
    COOLING: 3,
  };

  private readonly TARGET_STATE = {
    AUTO: 0,
    HEAT: 1,
    COOL: 2,
  };

  constructor(config: HeaterCoolerServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the HeaterCooler service
    this.service = config.accessory.getService(Service.HeaterCooler) ||
      config.accessory.addService(Service.HeaterCooler);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      `${config.accessory.displayName} Heater`,
    );

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
        validValues: [this.TARGET_STATE.HEAT],
      })
      .onGet(this.handleTargetStateGet.bind(this));

    // Set up CurrentTemperature characteristic (required)
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this))
      .setProps({
        minValue: -40,
        maxValue: 100,
        minStep: 0.1,
      });

    // Set up HeatingThresholdTemperature characteristic
    // HomeKit standard range is 10-38°C to avoid Home app issues
    // Set initial value within range before setting props to avoid warning
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .updateValue(20) // Default to 20°C
      .setProps({
        minValue: 10,
        maxValue: 38,
        minStep: 1,
      })
      .onGet(this.handleHeatingThresholdGet.bind(this))
      .onSet(this.handleHeatingThresholdSet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('HeaterCoolerService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle Active GET request
   * Returns 1 (ACTIVE) or 0 (INACTIVE)
   */
  private handleActiveGet(): CharacteristicValue {
    const state = this.device.getState();
    // Active means fan is on AND heating is enabled
    const active = state.isOn && state.heatingEnabled ? 1 : 0;
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

    try {
      if (active) {
        // Turn on heating mode
        await this.device.setHeatingMode(true);
        // Ensure fan is on
        const state = this.device.getState();
        if (!state.isOn) {
          await this.device.setFanPower(true);
        }
      } else {
        // Turn off heating mode (fan may stay on)
        await this.device.setHeatingMode(false);
      }
    } catch (error) {
      this.log.error('Failed to set heater active:', error);
      throw error;
    }
  }

  /**
   * Handle CurrentHeaterCoolerState GET request
   * Returns current operational state
   */
  private handleCurrentStateGet(): CharacteristicValue {
    const state = this.device.getState();

    let currentState: number;

    if (!state.isOn || !state.heatingEnabled) {
      currentState = this.CURRENT_STATE.INACTIVE;
    } else {
      // When heating is on, determine if actively heating or idle
      // Compare current temp to target temp
      const currentTemp = this.convertTemperature(state.temperature);
      const targetTemp = this.convertTargetTemperature(state.targetTemperature);

      if (currentTemp < targetTemp - 0.5) {
        currentState = this.CURRENT_STATE.HEATING;
      } else {
        currentState = this.CURRENT_STATE.IDLE;
      }
    }

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
    return this.TARGET_STATE.HEAT;
  }

  /**
   * Handle CurrentTemperature GET request
   * Returns current room temperature in Celsius
   */
  private handleCurrentTemperatureGet(): CharacteristicValue {
    const state = this.device.getState();
    const celsius = this.convertTemperature(state.temperature);
    this.log.debug('Get CurrentTemperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle HeatingThresholdTemperature GET request
   * Returns target temperature in Celsius
   */
  private handleHeatingThresholdGet(): CharacteristicValue {
    const state = this.device.getState();
    const celsius = this.convertTargetTemperature(state.targetTemperature);
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

    try {
      await this.device.setTargetTemperature(celsius);
    } catch (error) {
      this.log.error('Failed to set target temperature:', error);
      throw error;
    }
  }

  /**
   * Convert Dyson temperature (Kelvin × 10) to Celsius
   *
   * @param kelvinTimes10 - Temperature in Kelvin × 10
   * @returns Temperature in Celsius, or 20 if invalid
   */
  private convertTemperature(kelvinTimes10: number | undefined): number {
    if (kelvinTimes10 === undefined || kelvinTimes10 <= 0) {
      return 20; // Sensible default
    }
    const celsius = (kelvinTimes10 / 10) - 273.15;
    return Math.round(celsius * 10) / 10;
  }

  /**
   * Convert Dyson target temperature (Kelvin × 10) to Celsius
   *
   * @param kelvinTimes10 - Target temperature in Kelvin × 10
   * @returns Temperature in Celsius, or 20 if invalid
   */
  private convertTargetTemperature(kelvinTimes10: number | undefined): number {
    if (kelvinTimes10 === undefined || kelvinTimes10 <= 0) {
      return 20; // Default target
    }
    const celsius = (kelvinTimes10 / 10) - 273.15;
    // Round to nearest integer (Dyson uses integer temps)
    return Math.round(celsius);
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristics to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    this.log.debug('Heater state changed');

    const Characteristic = this.api.hap.Characteristic;

    // Update Active (on/off is controlled here, not via TargetHeaterCoolerState)
    const active = state.isOn && state.heatingEnabled ? 1 : 0;
    this.service.updateCharacteristic(Characteristic.Active, active);

    // Update CurrentHeaterCoolerState
    let currentState: number;
    if (!state.isOn || !state.heatingEnabled) {
      currentState = this.CURRENT_STATE.INACTIVE;
    } else {
      const currentTemp = this.convertTemperature(state.temperature);
      const targetTemp = this.convertTargetTemperature(state.targetTemperature);
      currentState = currentTemp < targetTemp - 0.5
        ? this.CURRENT_STATE.HEATING
        : this.CURRENT_STATE.IDLE;
    }
    this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentState);

    // Update CurrentTemperature
    const celsius = this.convertTemperature(state.temperature);
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, celsius);

    // Update HeatingThresholdTemperature
    const targetCelsius = this.convertTargetTemperature(state.targetTemperature);
    this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, targetCelsius);
  }

  /**
   * Update characteristics from current device state
   * Call this after connecting to sync HomeKit with device
   */
  updateFromState(): void {
    const state = this.device.getState();
    this.handleStateChange(state);
  }
}
