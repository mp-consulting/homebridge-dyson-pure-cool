/**
 * Thermostat Service Handler
 *
 * Implements the HomeKit Thermostat service for Dyson Hot+Cool devices.
 * Provides heating control with target temperature setting.
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
 * Configuration for ThermostatService
 */
export interface ThermostatServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
  /** Primary service to link this service to */
  primaryService?: Service;
}

/**
 * Temperature limits for Dyson heaters
 */
const TEMP_MIN = 1;   // 1°C minimum
const TEMP_MAX = 37;  // 37°C maximum

/**
 * ThermostatService handles the HomeKit Thermostat service for HP models
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - CurrentHeatingCoolingState: OFF (0) or HEAT (1) based on heatingEnabled
 * - TargetHeatingCoolingState: OFF (0) or HEAT (1) for control
 * - CurrentTemperature: Current room temperature
 * - TargetTemperature: Target heating temperature
 */
export class ThermostatService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;

  constructor(config: ThermostatServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the Thermostat service with name
    this.service = config.accessory.getService('thermostat') ||
      config.accessory.addService(Service.Thermostat, 'Thermostat', 'thermostat');

    // Set ConfiguredName for better HomeKit display
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.updateCharacteristic(Characteristic.ConfiguredName, 'Thermostat');

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
        minValue: -40,
        maxValue: 100,
        minStep: 0.1,
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

    // Link to primary service if provided
    if (config.primaryService) {
      this.service.addLinkedService(config.primaryService);
    }

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('ThermostatService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle CurrentHeatingCoolingState GET request
   * Returns 0 (OFF) or 1 (HEAT)
   */
  private handleCurrentStateGet(): CharacteristicValue {
    const state = this.device.getState();
    const isHeating = state.heatingEnabled ?? false;
    const value = isHeating ? 1 : 0; // HEAT or OFF
    this.log.debug('Get CurrentHeatingCoolingState ->', value);
    return value;
  }

  /**
   * Handle TargetHeatingCoolingState GET request
   */
  private handleTargetStateGet(): CharacteristicValue {
    const state = this.device.getState();
    const isHeating = state.heatingEnabled ?? false;
    const value = isHeating ? 1 : 0;
    this.log.debug('Get TargetHeatingCoolingState ->', value);
    return value;
  }

  /**
   * Handle TargetHeatingCoolingState SET request
   */
  private async handleTargetStateSet(value: CharacteristicValue): Promise<void> {
    const heating = value === 1; // HEAT
    this.log.debug('Set TargetHeatingCoolingState ->', heating ? 'HEAT' : 'OFF');

    try {
      await this.device.setHeating(heating);
    } catch (error) {
      this.log.error('Failed to set heating mode:', error);
      throw error;
    }
  }

  /**
   * Handle CurrentTemperature GET request
   */
  private handleCurrentTempGet(): CharacteristicValue {
    const state = this.device.getState();
    const celsius = this.convertTemperature(state.temperature);
    this.log.debug('Get CurrentTemperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle TargetTemperature GET request
   */
  private handleTargetTempGet(): CharacteristicValue {
    const state = this.device.getState();
    const celsius = this.convertTargetTemperature(state.targetTemperature);
    this.log.debug('Get TargetTemperature ->', celsius, '°C');
    return celsius;
  }

  /**
   * Handle TargetTemperature SET request
   */
  private async handleTargetTempSet(value: CharacteristicValue): Promise<void> {
    const celsius = value as number;
    this.log.debug('Set TargetTemperature ->', celsius, '°C');

    try {
      await this.device.setTargetTemperature(celsius);
    } catch (error) {
      this.log.error('Failed to set target temperature:', error);
      throw error;
    }
  }

  /**
   * Convert Dyson temperature (Kelvin × 10) to Celsius
   */
  private convertTemperature(kelvinTimes10: number | undefined): number {
    if (kelvinTimes10 === undefined || kelvinTimes10 <= 0) {
      return 20; // Default
    }
    const celsius = (kelvinTimes10 / 10) - 273.15;
    return Math.round(celsius * 10) / 10;
  }

  /**
   * Convert Dyson target temperature (Kelvin × 10) to Celsius
   */
  private convertTargetTemperature(kelvinTimes10: number | undefined): number {
    if (kelvinTimes10 === undefined || kelvinTimes10 <= 0) {
      return 20; // Default target
    }
    const celsius = (kelvinTimes10 / 10) - 273.15;
    // Round to integer and clamp to valid range
    return Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(celsius)));
  }

  /**
   * Handle device state changes
   */
  private handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    // Update heating state
    const heatingValue = state.heatingEnabled ? 1 : 0;
    this.service.updateCharacteristic(
      Characteristic.CurrentHeatingCoolingState,
      heatingValue,
    );
    this.service.updateCharacteristic(
      Characteristic.TargetHeatingCoolingState,
      heatingValue,
    );

    // Update current temperature
    const currentTemp = this.convertTemperature(state.temperature);
    this.service.updateCharacteristic(
      Characteristic.CurrentTemperature,
      currentTemp,
    );

    // Update target temperature
    const targetTemp = this.convertTargetTemperature(state.targetTemperature);
    this.service.updateCharacteristic(
      Characteristic.TargetTemperature,
      targetTemp,
    );
  }

  /**
   * Update characteristics from current device state
   */
  updateFromState(): void {
    const state = this.device.getState();
    this.handleStateChange(state);
  }
}
