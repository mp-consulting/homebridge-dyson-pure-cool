/**
 * Fan Service Handler
 *
 * Implements the HomeKit Fanv2 service for Dyson devices.
 * Handles Active, RotationSpeed, SwingMode, and TargetFanState characteristics.
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
import { MessageCodec } from '../../protocol/messageCodec.js';

/**
 * Configuration for FanService
 */
export interface FanServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * FanService handles the Fanv2 HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - Active (0/1) ↔ isOn (boolean)
 * - RotationSpeed (0-100%) ↔ fanSpeed (1-10)
 * - SwingMode (0/1) ↔ oscillation (boolean)
 * - TargetFanState (0=MANUAL, 1=AUTO) ↔ autoMode (boolean)
 */
export class FanService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;
  private readonly codec: MessageCodec;

  constructor(config: FanServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;
    this.codec = new MessageCodec();

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the Fanv2 service
    this.service = config.accessory.getService(Service.Fanv2) ||
      config.accessory.addService(Service.Fanv2);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      config.accessory.displayName,
    );

    // Set up Active characteristic (required)
    this.service.getCharacteristic(Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    // Set up RotationSpeed characteristic (optional but we want it)
    this.service.getCharacteristic(Characteristic.RotationSpeed)
      .onGet(this.handleSpeedGet.bind(this))
      .onSet(this.handleSpeedSet.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 10,
      });

    // Set up SwingMode characteristic (optional but we want it)
    this.service.getCharacteristic(Characteristic.SwingMode)
      .onGet(this.handleSwingModeGet.bind(this))
      .onSet(this.handleSwingModeSet.bind(this));

    // Set up TargetFanState characteristic for AUTO/MANUAL mode
    // 0 = MANUAL, 1 = AUTO
    this.service.getCharacteristic(Characteristic.TargetFanState)
      .onGet(this.handleTargetFanStateGet.bind(this))
      .onSet(this.handleTargetFanStateSet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('FanService initialized for', config.accessory.displayName);
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
    const active = state.isOn ? 1 : 0;
    this.log.debug('Get Active ->', active);
    return active;
  }

  /**
   * Handle Active SET request
   * @param value - 1 (ACTIVE) or 0 (INACTIVE)
   */
  private async handleActiveSet(value: CharacteristicValue): Promise<void> {
    const isOn = value === 1;
    this.log.debug('Set Active ->', isOn);

    try {
      await this.device.setFanPower(isOn);
    } catch (error) {
      this.log.error('Failed to set fan power:', error);
      throw error;
    }
  }

  /**
   * Handle RotationSpeed GET request
   * Returns 0-100 percentage
   */
  private handleSpeedGet(): CharacteristicValue {
    const state = this.device.getState();
    const percent = this.codec.speedToPercent(state.fanSpeed);
    this.log.debug('Get RotationSpeed ->', percent);
    return percent;
  }

  /**
   * Handle RotationSpeed SET request
   * @param value - 0-100 percentage
   */
  private async handleSpeedSet(value: CharacteristicValue): Promise<void> {
    const percent = value as number;
    this.log.debug('Set RotationSpeed ->', percent);

    try {
      if (percent === 0) {
        // 0% means turn off the fan
        await this.device.setFanPower(false);
      } else {
        // Convert percentage to speed (1-10)
        const speed = this.codec.percentToSpeed(percent);
        await this.device.setFanSpeed(speed);

        // Also ensure fan is on when setting speed
        const state = this.device.getState();
        if (!state.isOn) {
          await this.device.setFanPower(true);
        }
      }
    } catch (error) {
      this.log.error('Failed to set fan speed:', error);
      throw error;
    }
  }

  /**
   * Handle SwingMode GET request
   * Returns 1 (SWING_ENABLED) or 0 (SWING_DISABLED)
   */
  private handleSwingModeGet(): CharacteristicValue {
    const state = this.device.getState();
    const swingMode = state.oscillation ? 1 : 0;
    this.log.debug('Get SwingMode ->', swingMode);
    return swingMode;
  }

  /**
   * Handle SwingMode SET request
   * @param value - 1 (SWING_ENABLED) or 0 (SWING_DISABLED)
   */
  private async handleSwingModeSet(value: CharacteristicValue): Promise<void> {
    const oscillation = value === 1;
    this.log.debug('Set SwingMode ->', oscillation);

    try {
      await this.device.setOscillation(oscillation);
    } catch (error) {
      this.log.error('Failed to set oscillation:', error);
      throw error;
    }
  }

  /**
   * Handle TargetFanState GET request
   * Returns 1 (AUTO) or 0 (MANUAL)
   */
  private handleTargetFanStateGet(): CharacteristicValue {
    const state = this.device.getState();
    const targetState = state.autoMode ? 1 : 0;
    this.log.debug('Get TargetFanState ->', targetState);
    return targetState;
  }

  /**
   * Handle TargetFanState SET request
   * @param value - 1 (AUTO) or 0 (MANUAL)
   */
  private async handleTargetFanStateSet(value: CharacteristicValue): Promise<void> {
    const autoMode = value === 1;
    this.log.debug('Set TargetFanState ->', autoMode ? 'AUTO' : 'MANUAL');

    try {
      await this.device.setAutoMode(autoMode);
    } catch (error) {
      this.log.error('Failed to set auto mode:', error);
      throw error;
    }
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristics to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    this.log.debug('Device state changed, updating characteristics');

    const Characteristic = this.api.hap.Characteristic;

    // Update Active
    this.service.updateCharacteristic(
      Characteristic.Active,
      state.isOn ? 1 : 0,
    );

    // Update RotationSpeed
    const percent = this.codec.speedToPercent(state.fanSpeed);
    this.service.updateCharacteristic(
      Characteristic.RotationSpeed,
      percent,
    );

    // Update SwingMode
    this.service.updateCharacteristic(
      Characteristic.SwingMode,
      state.oscillation ? 1 : 0,
    );

    // Update TargetFanState (AUTO/MANUAL mode)
    this.service.updateCharacteristic(
      Characteristic.TargetFanState,
      state.autoMode ? 1 : 0,
    );
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
