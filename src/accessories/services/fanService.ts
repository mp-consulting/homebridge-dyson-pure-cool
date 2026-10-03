/**
 * Fan Service Handler (Air Purifier)
 *
 * Implements the HomeKit AirPurifier service for Dyson devices.
 * Handles Active, CurrentAirPurifierState, TargetAirPurifierState,
 * RotationSpeed, and SwingMode characteristics.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { FAN_SPEED, MessageCodec } from '../../protocol/messageCodec.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for FanService
 */
export interface FanServiceConfig extends Omit<BaseServiceConfig<DysonLinkDevice>, 'primaryService'> {
  /** Device name to display in HomeKit */
  deviceName: string;
  /**
   * Whether the device supports auto mode. When false (e.g. plain fans with
   * no air-quality sensor), the required TargetAirPurifierState characteristic
   * is pinned to MANUAL so HomeKit does not offer a non-functional Auto toggle.
   */
  supportsAutoMode?: boolean;
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

/** Debounce delay in milliseconds for slider inputs */
const DEBOUNCE_DELAY_MS = 300;

/**
 * Rotation speed characteristic properties
 * Maps to Dyson fan speed 1-10 (10% per level)
 */
const ROTATION_SPEED = {
  MIN: 0,
  MAX: 100,
  /** Each step represents one Dyson fan speed level */
  STEP: 10,
} as const;

/** Callbacks of a RotationSpeed SET waiting for the debounced command */
interface SpeedWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * FanService handles the AirPurifier HomeKit service
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - Active (0/1) ↔ isOn (boolean)
 * - CurrentAirPurifierState (0=INACTIVE, 1=IDLE, 2=PURIFYING) ↔ isOn + fanSpeed
 * - TargetAirPurifierState (0=MANUAL, 1=AUTO) ↔ autoMode (boolean)
 * - RotationSpeed (0-100%) ↔ fanSpeed (1-10); keeps the last manual speed in auto mode
 * - SwingMode (0/1) ↔ oscillation (boolean)
 */
export class FanService extends BaseService<DysonLinkDevice> {
  /** Timer for debouncing speed changes */
  private speedDebounceTimer?: ReturnType<typeof setTimeout>;
  /** Pending speed value to be set after debounce */
  private pendingSpeed?: number;
  /** SET requests waiting for the debounced command to complete */
  private speedWaiters: SpeedWaiter[] = [];
  /** Whether this service has been destroyed */
  private destroyed = false;
  /** Last manual fan speed (1-10), shown on the slider while in auto mode */
  private lastManualSpeed: number = FAN_SPEED.DEFAULT;

  constructor(config: FanServiceConfig) {
    super(config, {
      type: config.api.hap.Service.AirPurifier,
      name: config.deviceName,
      subtype: 'air-purifier',
      // Earlier versions may have created the service under another subtype
      findExisting: (accessory) => accessory.getService(config.api.hap.Service.AirPurifier),
    });

    const Characteristic = this.api.hap.Characteristic;

    // Set up Active characteristic (required)
    this.service.getCharacteristic(Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    // Set up CurrentAirPurifierState characteristic (required, read-only)
    this.service.getCharacteristic(Characteristic.CurrentAirPurifierState)
      .onGet(this.handleCurrentStateGet.bind(this));

    // Set up TargetAirPurifierState characteristic (required)
    // 0 = MANUAL, 1 = AUTO
    const targetState = this.service.getCharacteristic(Characteristic.TargetAirPurifierState)
      .onGet(this.handleTargetStateGet.bind(this))
      .onSet(this.handleTargetStateSet.bind(this));
    // Devices without auto mode (plain fans) can only ever be MANUAL. Restrict
    // the allowed values so HomeKit hides the Auto option instead of showing a
    // toggle that would send an unsupported command to the device.
    if (config.supportsAutoMode === false) {
      targetState.setProps({ validValues: [TargetAirPurifierState.MANUAL] });
    }

    // Set up RotationSpeed characteristic (optional but we want it)
    this.service.getCharacteristic(Characteristic.RotationSpeed)
      .onGet(this.handleSpeedGet.bind(this))
      .onSet(this.handleSpeedSet.bind(this))
      .setProps({
        minValue: ROTATION_SPEED.MIN,
        maxValue: ROTATION_SPEED.MAX,
        minStep: ROTATION_SPEED.STEP,
      });

    // Set up SwingMode characteristic (optional but we want it)
    this.service.getCharacteristic(Characteristic.SwingMode)
      .onGet(this.handleSwingModeGet.bind(this))
      .onSet(this.handleSwingModeSet.bind(this));

    this.log.debug('FanService (AirPurifier) initialized for', config.accessory.displayName);
  }

  /**
   * Clean up event listeners and timers
   */
  override destroy(): void {
    this.destroyed = true;
    super.destroy();
    if (this.speedDebounceTimer) {
      clearTimeout(this.speedDebounceTimer);
    }
    this.settleSpeedWaiters();
  }

  /**
   * Handle Active GET request
   * Returns 1 (ACTIVE) or 0 (INACTIVE)
   */
  private handleActiveGet(): CharacteristicValue {
    this.assertConnected();
    const active = this.device.getState().isOn ? 1 : 0;
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
    await this.runCommand('set fan power', () => this.device.setFanPower(isOn));
  }

  /**
   * Handle CurrentAirPurifierState GET request
   * Returns 0 (INACTIVE), 1 (IDLE), or 2 (PURIFYING_AIR)
   */
  private handleCurrentStateGet(): CharacteristicValue {
    this.assertConnected();
    const currentState = this.getCurrentState(this.device.getState());
    this.log.debug('Get CurrentAirPurifierState ->', currentState);
    return currentState;
  }

  /**
   * Handle TargetAirPurifierState GET request
   * Returns 1 (AUTO) or 0 (MANUAL)
   */
  private handleTargetStateGet(): CharacteristicValue {
    this.assertConnected();
    const targetState = this.getTargetState(this.device.getState());
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
    await this.runCommand('set auto mode', () => this.device.setAutoMode(autoMode));
  }

  /**
   * Handle RotationSpeed GET request
   * Returns 0-100 percentage
   */
  private handleSpeedGet(): CharacteristicValue {
    this.assertConnected();
    const percent = this.getSpeedPercent(this.device.getState());
    this.log.debug('Get RotationSpeed ->', percent);
    return percent;
  }

  /**
   * Handle RotationSpeed SET request
   * Uses debouncing to prevent flooding the device when dragging the slider.
   * Resolves once the debounced command has been sent, so failures reach HomeKit.
   * @param value - 0-100 percentage
   */
  private handleSpeedSet(value: CharacteristicValue): Promise<void> {
    this.pendingSpeed = value as number;

    // Clear any existing debounce timer
    if (this.speedDebounceTimer) {
      clearTimeout(this.speedDebounceTimer);
    }

    // Set new debounce timer
    this.speedDebounceTimer = setTimeout(() => {
      void this.applyPendingSpeed();
    }, DEBOUNCE_DELAY_MS);

    return new Promise((resolve, reject) => {
      this.speedWaiters.push({ resolve, reject });
    });
  }

  /**
   * Apply the pending speed value after debounce delay
   */
  private async applyPendingSpeed(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const percent = this.pendingSpeed;
    if (percent === undefined) {
      this.settleSpeedWaiters();
      return;
    }

    this.log.debug('Set RotationSpeed ->', percent);
    this.pendingSpeed = undefined;

    try {
      await this.runCommand('set fan speed', async () => {
        if (percent === 0) {
          // 0% means turn off the fan
          await this.device.setFanPower(false);
          return;
        }
        // Power on first (which may re-apply auto mode or other activation
        // defaults), then set the speed in the same tick so the explicit
        // speed wins in the merged MQTT command.
        const speed = MessageCodec.percentToSpeed(percent);
        const commands: Promise<void>[] = [];
        if (!this.device.getState().isOn) {
          commands.push(this.device.setFanPower(true));
        }
        commands.push(this.device.setFanSpeed(speed));
        await Promise.all(commands);
      });
      this.settleSpeedWaiters();
    } catch (error) {
      this.settleSpeedWaiters(error);
    }
  }

  /**
   * Resolve (or reject) every SET request waiting on the debounced command
   */
  private settleSpeedWaiters(error?: unknown): void {
    const waiters = this.speedWaiters;
    this.speedWaiters = [];
    for (const waiter of waiters) {
      if (error === undefined) {
        waiter.resolve();
      } else {
        waiter.reject(error);
      }
    }
  }

  /**
   * Handle SwingMode GET request
   * Returns 1 (SWING_ENABLED) or 0 (SWING_DISABLED)
   */
  private handleSwingModeGet(): CharacteristicValue {
    this.assertConnected();
    const swingMode = this.device.getState().oscillation ? 1 : 0;
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
    await this.runCommand('set oscillation', () => this.device.setOscillation(oscillation));
  }

  private getCurrentState(state: DeviceState): number {
    if (!state.isOn) {
      return AirPurifierState.INACTIVE;
    }
    if (state.fanSpeed === 0) {
      return AirPurifierState.IDLE;
    }
    // Device is on and running (whether manual or auto mode)
    return AirPurifierState.PURIFYING_AIR;
  }

  private getTargetState(state: DeviceState): number {
    return state.autoMode ? TargetAirPurifierState.AUTO : TargetAirPurifierState.MANUAL;
  }

  /**
   * RotationSpeed percentage. In auto mode the device reports no numeric
   * speed, so the last manual speed is shown instead of 0%.
   */
  private getSpeedPercent(state: DeviceState): number {
    if (state.fanSpeed > 0) {
      this.lastManualSpeed = state.fanSpeed;
      return MessageCodec.speedToPercent(state.fanSpeed);
    }
    if (state.fanSpeed === FAN_SPEED.AUTO || state.autoMode) {
      return MessageCodec.speedToPercent(this.lastManualSpeed);
    }
    return MessageCodec.speedToPercent(state.fanSpeed);
  }

  protected handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;
    this.update(Characteristic.Active, state.isOn ? 1 : 0);
    this.update(Characteristic.CurrentAirPurifierState, this.getCurrentState(state));
    this.update(Characteristic.TargetAirPurifierState, this.getTargetState(state));
    this.update(Characteristic.RotationSpeed, this.getSpeedPercent(state));
    this.update(Characteristic.SwingMode, state.oscillation ? 1 : 0);
  }
}
