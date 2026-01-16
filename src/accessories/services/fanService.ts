/**
 * Fan Service Handler (Air Purifier)
 *
 * Implements the HomeKit AirPurifier service for Dyson devices.
 * Handles Active, CurrentAirPurifierState, TargetAirPurifierState,
 * RotationSpeed, and SwingMode characteristics.
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
  /** Device name to display in HomeKit */
  deviceName: string;
}

/**
 * AirPurifier state values
 */
const AirPurifierState = {
  INACTIVE: 0,
  IDLE: 1,
  PURIFYING_AIR: 2,
} as const;

/**
 * TargetAirPurifierState values
 */
const TargetAirPurifierState = {
  MANUAL: 0,
  AUTO: 1,
} as const;

/**
 * FanService handles the AirPurifier HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - Active (0/1) ↔ isOn (boolean)
 * - CurrentAirPurifierState (0=INACTIVE, 1=IDLE, 2=PURIFYING) ↔ isOn + fanSpeed
 * - TargetAirPurifierState (0=MANUAL, 1=AUTO) ↔ autoMode (boolean)
 * - RotationSpeed (0-100%) ↔ fanSpeed (1-10)
 * - SwingMode (0/1) ↔ oscillation (boolean)
 */
/** Debounce delay in milliseconds for slider inputs */
const DEBOUNCE_DELAY_MS = 300;

export class FanService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;
  private readonly codec: MessageCodec;

  /** Timer for debouncing speed changes */
  private speedDebounceTimer?: ReturnType<typeof setTimeout>;
  /** Pending speed value to be set after debounce */
  private pendingSpeed?: number;

  constructor(config: FanServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;
    this.codec = new MessageCodec();

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the AirPurifier service with device name
    this.service = config.accessory.getService(Service.AirPurifier) ||
      config.accessory.addService(Service.AirPurifier, config.deviceName, 'air-purifier');

    // Set ConfiguredName for better HomeKit display
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.updateCharacteristic(Characteristic.ConfiguredName, config.deviceName);

    // Set up Active characteristic (required)
    this.service.getCharacteristic(Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    // Set up CurrentAirPurifierState characteristic (required, read-only)
    this.service.getCharacteristic(Characteristic.CurrentAirPurifierState)
      .onGet(this.handleCurrentStateGet.bind(this));

    // Set up TargetAirPurifierState characteristic (required)
    // 0 = MANUAL, 1 = AUTO
    this.service.getCharacteristic(Characteristic.TargetAirPurifierState)
      .onGet(this.handleTargetStateGet.bind(this))
      .onSet(this.handleTargetStateSet.bind(this));

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

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('FanService (AirPurifier) initialized for', config.accessory.displayName);
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
   * Handle CurrentAirPurifierState GET request
   * Returns 0 (INACTIVE), 1 (IDLE), or 2 (PURIFYING_AIR)
   */
  private handleCurrentStateGet(): CharacteristicValue {
    const state = this.device.getState();

    let currentState: number;
    if (!state.isOn) {
      currentState = AirPurifierState.INACTIVE;
    } else if (state.fanSpeed === 0 || state.autoMode) {
      // In auto mode or speed 0, consider it idle/monitoring
      currentState = AirPurifierState.IDLE;
    } else {
      currentState = AirPurifierState.PURIFYING_AIR;
    }

    this.log.debug('Get CurrentAirPurifierState ->', currentState);
    return currentState;
  }

  /**
   * Handle TargetAirPurifierState GET request
   * Returns 1 (AUTO) or 0 (MANUAL)
   */
  private handleTargetStateGet(): CharacteristicValue {
    const state = this.device.getState();
    const targetState = state.autoMode ? TargetAirPurifierState.AUTO : TargetAirPurifierState.MANUAL;
    this.log.debug('Get TargetAirPurifierState ->', targetState);
    return targetState;
  }

  /**
   * Handle TargetAirPurifierState SET request
   * @param value - 1 (AUTO) or 0 (MANUAL)
   */
  private async handleTargetStateSet(value: CharacteristicValue): Promise<void> {
    const autoMode = value === TargetAirPurifierState.AUTO;
    this.log.debug('Set TargetAirPurifierState ->', autoMode ? 'AUTO' : 'MANUAL');

    try {
      await this.device.setAutoMode(autoMode);
    } catch (error) {
      this.log.error('Failed to set auto mode:', error);
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
   * Uses debouncing to prevent flooding the device when dragging the slider
   * @param value - 0-100 percentage
   */
  private handleSpeedSet(value: CharacteristicValue): void {
    const percent = value as number;
    this.pendingSpeed = percent;

    // Clear any existing debounce timer
    if (this.speedDebounceTimer) {
      clearTimeout(this.speedDebounceTimer);
    }

    // Set new debounce timer
    this.speedDebounceTimer = setTimeout(() => {
      this.applyPendingSpeed();
    }, DEBOUNCE_DELAY_MS);
  }

  /**
   * Apply the pending speed value after debounce delay
   */
  private async applyPendingSpeed(): Promise<void> {
    const percent = this.pendingSpeed;
    if (percent === undefined) {
      return;
    }

    this.log.debug('Set RotationSpeed ->', percent);
    this.pendingSpeed = undefined;

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

    // Update CurrentAirPurifierState
    let currentState: number;
    if (!state.isOn) {
      currentState = AirPurifierState.INACTIVE;
    } else if (state.fanSpeed === 0 || state.autoMode) {
      currentState = AirPurifierState.IDLE;
    } else {
      currentState = AirPurifierState.PURIFYING_AIR;
    }
    this.service.updateCharacteristic(
      Characteristic.CurrentAirPurifierState,
      currentState,
    );

    // Update TargetAirPurifierState
    this.service.updateCharacteristic(
      Characteristic.TargetAirPurifierState,
      state.autoMode ? TargetAirPurifierState.AUTO : TargetAirPurifierState.MANUAL,
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
