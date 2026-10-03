/**
 * Dyson Link Device Class
 *
 * Concrete implementation for Dyson devices.
 * Supports fan control, heating, humidification across all models.
 */

import { DysonDevice } from './dysonDevice.js';
import type { DeviceFeatures, DeviceInfo } from './types.js';
import { MessageCodec, FAN_SPEED, HEATING_TEMP, HUMIDITY, PROTOCOL, FORMAT } from '../protocol/messageCodec.js';
import type { MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';
import { getDeviceFeatures, getPowerProtocol } from '../config/index.js';

// ============================================================================
// DysonLinkDevice
// ============================================================================

/**
 * Modes to switch on automatically whenever the device is activated.
 *
 * Each flag mirrors an `enable*WhenActivating` option in the plugin config.
 * Flags are additionally gated by the device's catalog features, so a mode is
 * never sent to a model that does not support it.
 */
export interface ActivationDefaults {
  /** Enable auto mode when the device is turned on */
  autoMode?: boolean;
  /** Enable oscillation when the device is turned on */
  oscillation?: boolean;
  /** Enable night mode when the device is turned on */
  nightMode?: boolean;
}

/**
 * Dyson Link Device implementation
 *
 * Handles fan control for all Dyson purifier devices.
 * Features are determined by the device catalog based on product type.
 *
 * Commands are batched within a microtask to allow concurrent HomeKit
 * characteristic updates (e.g., Active + TargetState) to be merged
 * into a single MQTT command.
 */
export class DysonLinkDevice extends DysonDevice {
  /** Product type for this device */
  readonly productType: string;

  /** Features supported by this device */
  readonly supportedFeatures: DeviceFeatures;

  /**
   * Whether this device uses the dedicated `fpwr` power field instead of the
   * legacy `fmod` field. Derived from the device catalog (see PowerProtocol).
   */
  private readonly usesFpwrProtocol: boolean;

  /** Pending command fields to be batched and sent */
  private pendingCommandFields: Record<string, string> = {};

  /** Promise for the scheduled flush, shared by every setter batched into it */
  private pendingFlush: Promise<void> | null = null;

  /**
   * Power state most recently commanded but not yet confirmed by the device.
   * Lets a quick off -> on sequence send ON even though the reported state
   * still says the fan is on.
   */
  private commandedPower: boolean | null = null;

  /** Whether a power-off is in progress (prevents concurrent commands from overriding OFF) */
  private turningOff = false;

  /** Modes to switch on automatically on the next off -> on transition */
  private activationDefaults: ActivationDefaults = {};

  /**
   * Create a new DysonLinkDevice
   *
   * @param deviceInfo - Device information from discovery
   * @param mqttClientFactory - Optional factory for creating MQTT client (for testing)
   * @param mqttConnectFn - Optional MQTT connect function (for testing)
   */
  constructor(
    deviceInfo: DeviceInfo,
    mqttClientFactory?: MqttClientFactory,
    mqttConnectFn?: MqttConnectFn,
  ) {
    super(deviceInfo, mqttClientFactory, mqttConnectFn);
    this.productType = deviceInfo.productType;
    this.supportedFeatures = getDeviceFeatures(deviceInfo.productType);

    // Power command protocol is catalog-driven. Most models use the legacy
    // `fmod` field (power + mode combined); a subset — the Pure Cool Link
    // series (TP02/DP01) and newer fans like the CF1 (739) — only honour the
    // dedicated `fpwr` field for power, with `auto`/`fnsp` for mode/speed.
    this.usesFpwrProtocol = getPowerProtocol(deviceInfo.productType) === 'fpwr';
  }

  /**
   * Queue command fields to be sent. Fields are merged and flushed
   * on the next microtask, allowing concurrent HomeKit updates to
   * produce a single MQTT command.
   *
   * @returns A promise that settles once the batched command has been sent,
   *   rejecting if publishing failed (so HomeKit can surface the error)
   */
  private queueCommand(fields: Record<string, string>): Promise<void> {
    Object.assign(this.pendingCommandFields, fields);

    if (!this.pendingFlush) {
      const flush = new Promise<void>((resolve, reject) => {
        queueMicrotask(() => {
          this.flushCommand().then(resolve, reject);
        });
      });
      // Callers that don't await must not trigger an unhandled rejection;
      // awaiting callers still receive the error.
      flush.catch(() => {});
      this.pendingFlush = flush;
    }
    return this.pendingFlush;
  }

  /**
   * Flush all pending command fields as a single MQTT command
   */
  private async flushCommand(): Promise<void> {
    this.pendingFlush = null;
    const fields = this.pendingCommandFields;
    this.pendingCommandFields = {};

    if (Object.keys(fields).length > 0) {
      await this.sendCommand(fields);
    }
  }

  /**
   * Build the fields that switch the fan on in manual or auto mode,
   * honouring the model's power protocol (`fpwr` vs legacy `fmod`).
   */
  private buildPowerOnFields(auto: boolean, speed: number): Record<string, string> {
    const encodedSpeed = MessageCodec.encodeFanSpeed(auto ? FAN_SPEED.AUTO : speed);
    if (this.usesFpwrProtocol) {
      return { fpwr: PROTOCOL.ON, auto: auto ? PROTOCOL.ON : PROTOCOL.OFF, fnsp: encodedSpeed };
    }
    return auto ? { fmod: PROTOCOL.AUTO } : { fmod: PROTOCOL.FAN, fnsp: encodedSpeed };
  }

  /** Last manual speed, or the default when the device hasn't reported one */
  private currentManualSpeed(): number {
    return this.state.fanSpeed > 0 ? this.state.fanSpeed : FAN_SPEED.DEFAULT;
  }

  /**
   * Set fan power on or off
   *
   * Uses the dedicated `fpwr` field (with `auto`/`fnsp`) for devices whose
   * catalog entry declares `powerProtocol: 'fpwr'`, otherwise the legacy
   * `fmod` field. See {@link getPowerProtocol}.
   *
   * @param on - True to turn on, false to turn off
   */
  async setFanPower(on: boolean): Promise<void> {
    if (on) {
      this.turningOff = false;
      // If already on, skip to avoid overriding mode changes
      // (HomeKit often sends Active=true along with mode changes).
      // Don't skip when an OFF we sent hasn't been confirmed yet: the
      // reported state is stale and the device is actually turning off.
      if (this.state.isOn && this.commandedPower !== false) {
        return;
      }

      this.commandedPower = true;
      const powerOn = this.usesFpwrProtocol
        ? this.queueCommand(this.buildPowerOnFields(this.state.autoMode, this.currentManualSpeed()))
        : this.queueCommand({ fmod: this.state.autoMode ? PROTOCOL.AUTO : PROTOCOL.FAN });

      await Promise.all([powerOn, this.applyActivationDefaults()]);
    } else {
      // Power off: send directly to prevent concurrent mode changes
      // (e.g. TargetAirPurifierState) from overwriting the OFF command
      // via command batching. The turningOff flag prevents other methods
      // called in the same tick from queuing commands that override OFF.
      this.turningOff = true;
      this.commandedPower = false;
      this.pendingCommandFields = {};
      try {
        await this.sendCommand(this.usesFpwrProtocol ? { fpwr: PROTOCOL.OFF } : { fmod: PROTOCOL.OFF });
      } finally {
        this.turningOff = false;
      }
    }
  }

  /**
   * Configure modes to switch on automatically whenever the device is activated.
   *
   * Applied only on an off -> on transition, and only for modes the device
   * supports. Passing an empty object clears any previously set defaults.
   *
   * @param defaults - Modes to enable on activation
   */
  setActivationDefaults(defaults: ActivationDefaults): void {
    this.activationDefaults = defaults;
  }

  /**
   * Queue the configured activation modes alongside a power-on command.
   *
   * These are queued from the same tick as the power command, so they merge
   * into a single MQTT message instead of racing it. Modes the device does not
   * support are skipped rather than sent and ignored by the device.
   */
  private async applyActivationDefaults(): Promise<void> {
    const { autoMode, oscillation, nightMode } = this.activationDefaults;
    const queued: Promise<void>[] = [];

    // Collected rather than awaited one by one: each `await` would yield to the
    // microtask queue and let the pending flush run, splitting what should be a
    // single MQTT message into one per mode.
    if (autoMode && this.supportedFeatures.autoMode) {
      queued.push(this.setAutoMode(true));
    }

    if (oscillation && this.supportedFeatures.oscillation) {
      queued.push(this.setOscillation(true));
    }

    if (nightMode && this.supportedFeatures.nightMode) {
      queued.push(this.setNightMode(true));
    }

    await Promise.all(queued);
  }

  /**
   * Set fan speed
   *
   * @param speed - Fan speed (1-10) or -1 for auto mode
   */
  async setFanSpeed(speed: number): Promise<void> {
    if (this.turningOff) {
      return;
    }
    await this.queueCommand(this.buildPowerOnFields(speed < 0, speed));
  }

  /**
   * Set oscillation on or off
   */
  async setOscillation(on: boolean): Promise<void> {
    await this.queueCommand({ oson: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set night mode on or off
   */
  async setNightMode(on: boolean): Promise<void> {
    await this.queueCommand({ nmod: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set continuous monitoring on or off
   */
  async setContinuousMonitoring(on: boolean): Promise<void> {
    await this.queueCommand({ rhtm: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set auto mode on or off
   */
  async setAutoMode(on: boolean): Promise<void> {
    if (this.turningOff) {
      return;
    }
    await this.queueCommand(this.buildPowerOnFields(on, this.currentManualSpeed()));
  }

  /**
   * Set jet focus (front airflow direction) on or off
   */
  async setJetFocus(on: boolean): Promise<void> {
    await this.queueCommand({ ffoc: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set heating mode on or off (HP models only)
   */
  async setHeating(on: boolean): Promise<void> {
    await this.queueCommand({ hmod: on ? PROTOCOL.HEAT : PROTOCOL.OFF });
  }

  /**
   * Set target temperature for heating (HP models only)
   *
   * @param celsius - Target temperature in Celsius (1-37)
   */
  async setTargetTemperature(celsius: number): Promise<void> {
    const clampedTemp = Math.max(
      HEATING_TEMP.MIN_CELSIUS,
      Math.min(HEATING_TEMP.MAX_CELSIUS, celsius),
    );
    await this.queueCommand({ hmax: MessageCodec.encodeTemperature(clampedTemp) });
  }

  /**
   * Set humidifier mode on or off (PH models only)
   */
  async setHumidifier(on: boolean): Promise<void> {
    await this.queueCommand({ hume: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set humidifier to auto mode (PH models only)
   */
  async setHumidifierAuto(): Promise<void> {
    await this.queueCommand({ hume: PROTOCOL.AUTO });
  }

  /**
   * Set target humidity percentage (PH models only)
   *
   * @param percent - Target humidity (0-100)
   */
  async setTargetHumidity(percent: number): Promise<void> {
    const clampedPercent = Math.max(
      HUMIDITY.MIN_PERCENT,
      Math.min(HUMIDITY.MAX_PERCENT, Math.round(percent)),
    );
    await this.queueCommand({
      humt: String(clampedPercent).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR),
    });
  }

  /**
   * Disconnect from the device, clearing any pending commands
   */
  override async disconnect(): Promise<void> {
    // Clear pending commands to prevent stale fields from being sent on reconnect
    this.pendingCommandFields = {};
    this.commandedPower = null;
    await super.disconnect();
  }

  /**
   * Get the device features
   */
  getFeatures(): DeviceFeatures {
    return this.supportedFeatures;
  }

  /**
   * Handle state message from device
   *
   * Parses the device-specific state from CURRENT-STATE and STATE-CHANGE messages.
   */
  protected handleStateMessage(data: Record<string, unknown>): void {
    const productState = (data['product-state'] as Record<string, string>) ||
                         (data.data as Record<string, string>);

    if (!productState) {
      return;
    }

    this.emit('debug', `Received state: fmod=${productState.fmod}, auto=${productState.auto}, fnsp=${productState.fnsp}`);

    const parsedState = MessageCodec.parseRawState(productState);

    // Once the device reports the power state we commanded, it's confirmed
    if (parsedState.isOn !== undefined && parsedState.isOn === this.commandedPower) {
      this.commandedPower = null;
    }

    if (Object.keys(parsedState).length > 0) {
      this.updateState(parsedState);
    }
  }
}
