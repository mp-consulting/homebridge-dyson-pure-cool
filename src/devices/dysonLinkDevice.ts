/**
 * Dyson Link Device Class
 *
 * Concrete implementation for Dyson devices.
 * Supports fan control, heating, humidification across all models.
 */

import { DysonDevice } from './dysonDevice.js';
import type { DeviceFeatures, DeviceInfo } from './types.js';
import { MessageCodec, FAN_SPEED, HEATING_TEMP, HUMIDITY, PROTOCOL, FORMAT, TEMPERATURE } from '../protocol/messageCodec.js';
import type { MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';
import { getDeviceFeatures } from '../config/index.js';

// ============================================================================
// DysonLinkDevice
// ============================================================================

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

  /** Whether this is a Link series device (uses different protocol) */
  private readonly isLinkSeries: boolean;

  /** Pending command fields to be batched and sent */
  private pendingCommandFields: Record<string, string> = {};

  /** Whether a command flush is scheduled */
  private commandFlushScheduled = false;

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

    // Check if this is a Pure Cool Link device (TP02, DP01) - uses fpwr/auto protocol
    // Note: HP02 (455) is called "Hot+Cool Link" but uses fmod like newer devices
    // Only TP02 (475) and DP01 (469) use the older fpwr/auto protocol
    this.isLinkSeries = deviceInfo.productType === '475' || deviceInfo.productType === '469';
  }

  /**
   * Queue command fields to be sent. Fields are merged and flushed
   * on the next microtask, allowing concurrent HomeKit updates to
   * produce a single MQTT command.
   */
  private queueCommand(fields: Record<string, string>): void {
    Object.assign(this.pendingCommandFields, fields);

    if (!this.commandFlushScheduled) {
      this.commandFlushScheduled = true;
      queueMicrotask(() => this.flushCommand());
    }
  }

  /**
   * Flush all pending command fields as a single MQTT command
   */
  private async flushCommand(): Promise<void> {
    this.commandFlushScheduled = false;
    const fields = this.pendingCommandFields;
    this.pendingCommandFields = {};

    if (Object.keys(fields).length > 0) {
      try {
        await this.sendCommand(fields);
      } catch (error) {
        this.emit('commandError', error);
      }
    }
  }

  /**
   * Set fan power on or off
   *
   * Uses fmod command for newer models, fpwr/auto/fnsp for Link series.
   *
   * @param on - True to turn on, false to turn off
   */
  async setFanPower(on: boolean): Promise<void> {
    if (on) {
      // If already on, skip to avoid overriding mode changes
      // (HomeKit often sends Active=true along with mode changes)
      if (this.state.isOn) {
        return;
      }

      if (this.isLinkSeries) {
        if (this.state.autoMode) {
          this.queueCommand({ fpwr: PROTOCOL.ON, auto: PROTOCOL.ON, fnsp: PROTOCOL.AUTO });
        } else {
          const speed = this.state.fanSpeed > 0 ? this.state.fanSpeed : FAN_SPEED.DEFAULT;
          const encodedSpeed = String(speed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
          this.queueCommand({ fpwr: PROTOCOL.ON, auto: PROTOCOL.OFF, fnsp: encodedSpeed });
        }
      } else {
        if (this.state.autoMode) {
          this.queueCommand({ fmod: PROTOCOL.AUTO });
        } else {
          this.queueCommand({ fmod: PROTOCOL.FAN });
        }
      }
    } else {
      if (this.isLinkSeries) {
        this.queueCommand({ fpwr: PROTOCOL.OFF });
      } else {
        this.queueCommand({ fmod: PROTOCOL.OFF });
      }
    }
  }

  /**
   * Set fan speed
   *
   * @param speed - Fan speed (1-10) or -1 for auto mode
   */
  async setFanSpeed(speed: number): Promise<void> {
    if (this.isLinkSeries) {
      if (speed < 0) {
        this.queueCommand({ fpwr: PROTOCOL.ON, auto: PROTOCOL.ON, fnsp: PROTOCOL.AUTO });
      } else {
        const clampedSpeed = Math.max(FAN_SPEED.MIN, Math.min(FAN_SPEED.MAX, speed));
        const encodedSpeed = String(clampedSpeed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
        this.queueCommand({ fpwr: PROTOCOL.ON, auto: PROTOCOL.OFF, fnsp: encodedSpeed });
      }
    } else {
      if (speed < 0) {
        this.queueCommand({ fmod: PROTOCOL.AUTO });
      } else {
        const clampedSpeed = Math.max(FAN_SPEED.MIN, Math.min(FAN_SPEED.MAX, speed));
        const encodedSpeed = String(clampedSpeed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
        this.queueCommand({ fnsp: encodedSpeed, fmod: PROTOCOL.FAN });
      }
    }
  }

  /**
   * Set oscillation on or off
   */
  async setOscillation(on: boolean): Promise<void> {
    this.queueCommand({ oson: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set night mode on or off
   */
  async setNightMode(on: boolean): Promise<void> {
    this.queueCommand({ nmod: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set continuous monitoring on or off
   */
  async setContinuousMonitoring(on: boolean): Promise<void> {
    this.queueCommand({ rhtm: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set auto mode on or off
   */
  async setAutoMode(on: boolean): Promise<void> {
    if (this.isLinkSeries) {
      if (on) {
        this.queueCommand({ fpwr: PROTOCOL.ON, auto: PROTOCOL.ON, fnsp: PROTOCOL.AUTO });
      } else {
        const currentSpeed = this.state.fanSpeed > 0 ? this.state.fanSpeed : FAN_SPEED.DEFAULT;
        const encodedSpeed = String(currentSpeed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
        this.queueCommand({ fpwr: PROTOCOL.ON, auto: PROTOCOL.OFF, fnsp: encodedSpeed });
      }
    } else {
      if (on) {
        this.queueCommand({ fmod: PROTOCOL.AUTO });
      } else {
        const currentSpeed = this.state.fanSpeed > 0 ? this.state.fanSpeed : FAN_SPEED.DEFAULT;
        const encodedSpeed = String(currentSpeed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
        this.queueCommand({ fmod: PROTOCOL.FAN, fnsp: encodedSpeed });
      }
    }
  }

  /**
   * Set jet focus (front airflow direction) on or off
   */
  async setJetFocus(on: boolean): Promise<void> {
    this.queueCommand({ ffoc: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set heating mode on or off (HP models only)
   */
  async setHeating(on: boolean): Promise<void> {
    this.queueCommand({ hmod: on ? PROTOCOL.HEAT : PROTOCOL.OFF });
  }

  /**
   * Set heating mode on or off (HP-series only)
   * Alias for setHeating with feature check.
   */
  async setHeatingMode(on: boolean): Promise<void> {
    if (!this.supportedFeatures.heating) {
      throw new Error('Heating not supported on this device');
    }
    await this.setHeating(on);
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
    const kelvinTimes10 = Math.round(
      (clampedTemp + TEMPERATURE.KELVIN_OFFSET) * TEMPERATURE.KELVIN_MULTIPLIER,
    );
    this.queueCommand({ hmax: String(kelvinTimes10) });
  }

  /**
   * Set humidifier mode on or off (PH models only)
   */
  async setHumidifier(on: boolean): Promise<void> {
    this.queueCommand({ hume: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set humidifier to auto mode (PH models only)
   */
  async setHumidifierAuto(): Promise<void> {
    this.queueCommand({ hume: PROTOCOL.AUTO });
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
    this.queueCommand({
      humt: String(clampedPercent).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR),
    });
  }

  /**
   * Disconnect from the device, clearing any pending commands
   */
  override async disconnect(): Promise<void> {
    // Clear pending commands to prevent stale fields from being sent on reconnect
    this.pendingCommandFields = {};
    this.commandFlushScheduled = false;
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

    if (Object.keys(parsedState).length > 0) {
      this.updateState(parsedState);
    }
  }
}
