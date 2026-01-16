/**
 * Humidifier Service Handler
 *
 * Implements the HomeKit HumidifierDehumidifier service for Dyson PH models.
 * Provides humidifier control with target humidity setting.
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
 * Configuration for HumidifierControlService
 */
export interface HumidifierControlServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
  /** Enable full humidity range (0-100%) instead of Dyson default (30-70%) */
  fullRangeHumidity?: boolean;
}

/**
 * Default humidity limits (Dyson recommendation)
 */
const HUMIDITY_MIN_DEFAULT = 30;
const HUMIDITY_MAX_DEFAULT = 70;

/**
 * Full range humidity limits
 */
const HUMIDITY_MIN_FULL = 0;
const HUMIDITY_MAX_FULL = 100;

/**
 * HumidifierControlService handles the HomeKit HumidifierDehumidifier service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - Active: Humidifier on/off
 * - CurrentHumidifierDehumidifierState: OFF, IDLE, HUMIDIFYING
 * - TargetHumidifierDehumidifierState: HUMIDIFIER or AUTO
 * - CurrentRelativeHumidity: Current room humidity
 * - RelativeHumidityHumidifierThreshold: Target humidity
 * - WaterLevel: Water tank status
 */
export class HumidifierControlService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;
  private readonly humidityMin: number;
  private readonly humidityMax: number;

  constructor(config: HumidifierControlServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    // Set humidity range based on configuration
    if (config.fullRangeHumidity) {
      this.humidityMin = HUMIDITY_MIN_FULL;
      this.humidityMax = HUMIDITY_MAX_FULL;
    } else {
      this.humidityMin = HUMIDITY_MIN_DEFAULT;
      this.humidityMax = HUMIDITY_MAX_DEFAULT;
    }

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the HumidifierDehumidifier service
    this.service = config.accessory.getService(Service.HumidifierDehumidifier) ||
      config.accessory.addService(Service.HumidifierDehumidifier);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      'Humidifier',
    );

    // Set up Active characteristic
    this.service.getCharacteristic(Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    // Set up CurrentHumidifierDehumidifierState (read-only)
    // Values: INACTIVE (0), IDLE (1), HUMIDIFYING (2), DEHUMIDIFYING (3)
    this.service.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
      .onGet(this.handleCurrentStateGet.bind(this));

    // Set up TargetHumidifierDehumidifierState
    // Values: HUMIDIFIER_OR_DEHUMIDIFIER (0), HUMIDIFIER (1), DEHUMIDIFIER (2)
    // Dyson only supports HUMIDIFIER mode
    this.service.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
      .onGet(this.handleTargetStateGet.bind(this))
      .onSet(this.handleTargetStateSet.bind(this))
      .setProps({
        validValues: [
          Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER,
          Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER,
        ],
      });

    // Set up CurrentRelativeHumidity (read-only)
    this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentHumidityGet.bind(this));

    // Set up RelativeHumidityHumidifierThreshold (target humidity)
    this.service.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold)
      .onGet(this.handleTargetHumidityGet.bind(this))
      .onSet(this.handleTargetHumiditySet.bind(this))
      .setProps({
        minValue: this.humidityMin,
        maxValue: this.humidityMax,
        minStep: 1,
      });

    // Set up WaterLevel characteristic (read-only)
    this.service.getCharacteristic(Characteristic.WaterLevel)
      .onGet(this.handleWaterLevelGet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('HumidifierControlService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle Active GET request
   */
  private handleActiveGet(): CharacteristicValue {
    const state = this.device.getState();
    const active = state.humidifierEnabled ?? false;
    this.log.debug('Get Humidifier Active ->', active);
    return active ? 1 : 0;
  }

  /**
   * Handle Active SET request
   */
  private async handleActiveSet(value: CharacteristicValue): Promise<void> {
    const active = value === 1;
    this.log.debug('Set Humidifier Active ->', active);

    try {
      await this.device.setHumidifier(active);
    } catch (error) {
      this.log.error('Failed to set humidifier:', error);
      throw error;
    }
  }

  /**
   * Handle CurrentHumidifierDehumidifierState GET request
   */
  private handleCurrentStateGet(): CharacteristicValue {
    const state = this.device.getState();
    const Characteristic = this.api.hap.Characteristic;

    if (!state.humidifierEnabled) {
      return Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    }

    // Check if actively humidifying (current < target)
    const current = state.humidity ?? 50;
    const target = state.targetHumidity ?? 50;

    if (current < target) {
      return Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
    }

    return Characteristic.CurrentHumidifierDehumidifierState.IDLE;
  }

  /**
   * Handle TargetHumidifierDehumidifierState GET request
   */
  private handleTargetStateGet(): CharacteristicValue {
    const Characteristic = this.api.hap.Characteristic;
    // Always return HUMIDIFIER mode
    return Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
  }

  /**
   * Handle TargetHumidifierDehumidifierState SET request
   */
  private async handleTargetStateSet(value: CharacteristicValue): Promise<void> {
    const Characteristic = this.api.hap.Characteristic;
    this.log.debug('Set TargetHumidifierDehumidifierState ->', value);

    // If AUTO mode selected, enable auto humidification
    if (value === Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER) {
      try {
        await this.device.setHumidifierAuto();
      } catch (error) {
        this.log.error('Failed to set humidifier auto:', error);
        throw error;
      }
    }
  }

  /**
   * Handle CurrentRelativeHumidity GET request
   */
  private handleCurrentHumidityGet(): CharacteristicValue {
    const state = this.device.getState();
    const humidity = state.humidity ?? 50;
    this.log.debug('Get Current Humidity ->', humidity, '%');
    return humidity;
  }

  /**
   * Handle RelativeHumidityHumidifierThreshold GET request
   */
  private handleTargetHumidityGet(): CharacteristicValue {
    const state = this.device.getState();
    const target = state.targetHumidity ?? 50;
    // Clamp to configured range
    const clamped = Math.max(this.humidityMin, Math.min(this.humidityMax, target));
    this.log.debug('Get Target Humidity ->', clamped, '%');
    return clamped;
  }

  /**
   * Handle RelativeHumidityHumidifierThreshold SET request
   */
  private async handleTargetHumiditySet(value: CharacteristicValue): Promise<void> {
    const target = value as number;
    this.log.debug('Set Target Humidity ->', target, '%');

    try {
      await this.device.setTargetHumidity(target);
    } catch (error) {
      this.log.error('Failed to set target humidity:', error);
      throw error;
    }
  }

  /**
   * Handle WaterLevel GET request
   * Returns 100 if tank is full, 0 if empty
   */
  private handleWaterLevelGet(): CharacteristicValue {
    const state = this.device.getState();
    const waterLevel = state.waterTankEmpty ? 0 : 100;
    this.log.debug('Get Water Level ->', waterLevel, '%');
    return waterLevel;
  }

  /**
   * Handle device state changes
   */
  private handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    // Update Active state
    const active = state.humidifierEnabled ? 1 : 0;
    this.service.updateCharacteristic(Characteristic.Active, active);

    // Update current state
    let currentState = Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    if (state.humidifierEnabled) {
      const current = state.humidity ?? 50;
      const target = state.targetHumidity ?? 50;
      currentState = current < target
        ? Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        : Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    this.service.updateCharacteristic(
      Characteristic.CurrentHumidifierDehumidifierState,
      currentState,
    );

    // Update current humidity
    this.service.updateCharacteristic(
      Characteristic.CurrentRelativeHumidity,
      state.humidity ?? 50,
    );

    // Update target humidity
    const target = state.targetHumidity ?? 50;
    const clampedTarget = Math.max(this.humidityMin, Math.min(this.humidityMax, target));
    this.service.updateCharacteristic(
      Characteristic.RelativeHumidityHumidifierThreshold,
      clampedTarget,
    );

    // Update water level
    this.service.updateCharacteristic(
      Characteristic.WaterLevel,
      state.waterTankEmpty ? 0 : 100,
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
