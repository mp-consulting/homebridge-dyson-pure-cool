/**
 * Humidifier Service Handler
 *
 * Implements the HomeKit HumidifierDehumidifier service for Dyson PH models.
 * Provides humidifier control with target humidity setting.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for HumidifierControlService
 */
export interface HumidifierControlServiceConfig extends BaseServiceConfig<DysonLinkDevice> {
  /** Enable full humidity range (0-100%) instead of default (30-70%) */
  fullRangeHumidity?: boolean;
}

/**
 * Default humidity range for Dyson humidifiers
 */
const HUMIDITY_MIN_DEFAULT = 30;
const HUMIDITY_MAX_DEFAULT = 70;

/**
 * Full humidity range when enabled
 */
const HUMIDITY_MIN_FULL = 0;
const HUMIDITY_MAX_FULL = 100;

/** Water level reported when the tank is empty / not empty (%) */
const WATER_LEVEL = {
  EMPTY: 0,
  FULL: 100,
} as const;

/**
 * HumidifierControlService handles the HomeKit HumidifierDehumidifier service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - Active (0/1) ↔ humidifierEnabled
 * - CurrentHumidifierDehumidifierState ↔ humidifying when below target
 * - TargetHumidifierDehumidifierState: AUTO (0) ↔ humidifierAuto, HUMIDIFIER (1) otherwise
 * - CurrentRelativeHumidity ↔ humidity
 * - RelativeHumidityHumidifierThreshold ↔ targetHumidity
 * - WaterLevel ↔ waterTankEmpty
 */
export class HumidifierControlService extends BaseService<DysonLinkDevice> {
  private readonly humidityMin: number;
  private readonly humidityMax: number;

  constructor(config: HumidifierControlServiceConfig) {
    super(config, {
      type: config.api.hap.Service.HumidifierDehumidifier,
      name: 'Humidifier',
      subtype: 'humidifier',
    });

    // Set humidity range based on configuration
    if (config.fullRangeHumidity) {
      this.humidityMin = HUMIDITY_MIN_FULL;
      this.humidityMax = HUMIDITY_MAX_FULL;
    } else {
      this.humidityMin = HUMIDITY_MIN_DEFAULT;
      this.humidityMax = HUMIDITY_MAX_DEFAULT;
    }

    const Characteristic = this.api.hap.Characteristic;

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
    // Dyson supports manual humidification and an auto mode (mapped to 0)
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

    this.log.debug('HumidifierControlService initialized for', config.accessory.displayName);
  }

  /**
   * Handle Active GET request
   */
  private handleActiveGet(): CharacteristicValue {
    this.assertConnected();
    const active = this.device.getState().humidifierEnabled ? 1 : 0;
    this.log.debug('Get Humidifier Active ->', active);
    return active;
  }

  /**
   * Handle Active SET request
   */
  private async handleActiveSet(value: CharacteristicValue): Promise<void> {
    const active = value === 1;
    this.log.debug('Set Humidifier Active ->', active);
    await this.runCommand('set humidifier', () => this.device.setHumidifier(active));
  }

  /**
   * Handle CurrentHumidifierDehumidifierState GET request
   */
  private handleCurrentStateGet(): CharacteristicValue {
    this.assertConnected();
    return this.getCurrentState(this.device.getState());
  }

  /**
   * Handle TargetHumidifierDehumidifierState GET request
   * AUTO (HUMIDIFIER_OR_DEHUMIDIFIER) when the device runs in auto mode,
   * HUMIDIFIER otherwise
   */
  private handleTargetStateGet(): CharacteristicValue {
    this.assertConnected();
    return this.getTargetState(this.device.getState());
  }

  /**
   * Handle TargetHumidifierDehumidifierState SET request
   */
  private async handleTargetStateSet(value: CharacteristicValue): Promise<void> {
    const TargetState = this.api.hap.Characteristic.TargetHumidifierDehumidifierState;
    this.log.debug('Set TargetHumidifierDehumidifierState ->', value);

    if (value === TargetState.HUMIDIFIER_OR_DEHUMIDIFIER) {
      await this.runCommand('set humidifier auto', () => this.device.setHumidifierAuto());
    } else if (value === TargetState.HUMIDIFIER) {
      await this.runCommand('set humidifier manual', () => this.device.setHumidifier(true));
    }
  }

  /**
   * Handle CurrentRelativeHumidity GET request
   */
  private handleCurrentHumidityGet(): CharacteristicValue {
    this.assertConnected();
    const humidity = this.device.getState().humidity;
    if (humidity === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.CurrentRelativeHumidity);
    }
    this.log.debug('Get Current Humidity ->', humidity, '%');
    return humidity;
  }

  /**
   * Handle RelativeHumidityHumidifierThreshold GET request
   */
  private handleTargetHumidityGet(): CharacteristicValue {
    this.assertConnected();
    const target = this.getClampedTarget(this.device.getState());
    if (target === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.RelativeHumidityHumidifierThreshold);
    }
    this.log.debug('Get Target Humidity ->', target, '%');
    return target;
  }

  /**
   * Handle RelativeHumidityHumidifierThreshold SET request
   */
  private async handleTargetHumiditySet(value: CharacteristicValue): Promise<void> {
    const target = value as number;
    this.log.debug('Set Target Humidity ->', target, '%');
    await this.runCommand('set target humidity', () => this.device.setTargetHumidity(target));
  }

  /**
   * Handle WaterLevel GET request
   */
  private handleWaterLevelGet(): CharacteristicValue {
    this.assertConnected();
    const waterLevel = this.device.getState().waterTankEmpty ? WATER_LEVEL.EMPTY : WATER_LEVEL.FULL;
    this.log.debug('Get Water Level ->', waterLevel, '%');
    return waterLevel;
  }

  private getCurrentState(state: DeviceState): number {
    const CurrentState = this.api.hap.Characteristic.CurrentHumidifierDehumidifierState;
    if (!state.humidifierEnabled) {
      return CurrentState.INACTIVE;
    }
    // Humidifying while below target; idle when at target or unknown
    if (state.humidity !== undefined && state.targetHumidity !== undefined &&
        state.humidity < state.targetHumidity) {
      return CurrentState.HUMIDIFYING;
    }
    return CurrentState.IDLE;
  }

  private getTargetState(state: DeviceState): number {
    const TargetState = this.api.hap.Characteristic.TargetHumidifierDehumidifierState;
    return state.humidifierAuto ? TargetState.HUMIDIFIER_OR_DEHUMIDIFIER : TargetState.HUMIDIFIER;
  }

  private getClampedTarget(state: DeviceState): number | undefined {
    if (state.targetHumidity === undefined) {
      return undefined;
    }
    return Math.max(this.humidityMin, Math.min(this.humidityMax, state.targetHumidity));
  }

  protected handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    this.update(Characteristic.Active, state.humidifierEnabled ? 1 : 0);
    this.update(Characteristic.CurrentHumidifierDehumidifierState, this.getCurrentState(state));
    this.update(Characteristic.TargetHumidifierDehumidifierState, this.getTargetState(state));

    if (state.humidity !== undefined) {
      this.update(Characteristic.CurrentRelativeHumidity, state.humidity);
    }

    const target = this.getClampedTarget(state);
    if (target !== undefined) {
      this.update(Characteristic.RelativeHumidityHumidifierThreshold, target);
    }

    this.update(Characteristic.WaterLevel, state.waterTankEmpty ? WATER_LEVEL.EMPTY : WATER_LEVEL.FULL);
  }
}
