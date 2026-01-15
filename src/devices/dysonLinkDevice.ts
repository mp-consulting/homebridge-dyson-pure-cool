/**
 * Dyson Link Device Class
 *
 * Concrete implementation for Dyson devices.
 * Supports fan control, heating, humidification across all models.
 */

import { DysonDevice } from './dysonDevice.js';
import type { DeviceFeatures, DeviceInfo } from './types.js';
import { MessageCodec } from '../protocol/messageCodec.js';
import type { MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';
import { getDeviceFeatures } from '../config/index.js';

// ============================================================================
// Constants - No Magic Numbers
// ============================================================================

/** Fan speed limits */
const FAN_SPEED = {
  MIN: 1,
  MAX: 10,
  DEFAULT: 4,
  AUTO: -1,
} as const;

/** Temperature limits for heating (Celsius) */
const HEATING_TEMP = {
  MIN_CELSIUS: 1,
  MAX_CELSIUS: 37,
  KELVIN_OFFSET: 273.15,
  KELVIN_MULTIPLIER: 10,
} as const;

/** Humidity limits for humidifier */
const HUMIDITY = {
  MIN_PERCENT: 0,
  MAX_PERCENT: 100,
  DEFAULT_MIN: 30,
  DEFAULT_MAX: 70,
} as const;

/** Dyson protocol values */
const PROTOCOL = {
  ON: 'ON',
  OFF: 'OFF',
  AUTO: 'AUTO',
  FAN: 'FAN',
  HEAT: 'HEAT',
  SPEED_PAD_LENGTH: 4,
} as const;

// ============================================================================
// DysonLinkDevice
// ============================================================================

/**
 * Dyson Link Device implementation
 *
 * Handles fan control for all Dyson purifier devices.
 * Features are determined by the device catalog based on product type.
 */
export class DysonLinkDevice extends DysonDevice {
  /** Product type for this device */
  readonly productType: string;

  /** Features supported by this device */
  readonly supportedFeatures: DeviceFeatures;

  /** Message codec for encoding/decoding */
  private readonly codec: MessageCodec;

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
    this.codec = new MessageCodec();
  }

  /**
   * Set fan power on or off
   *
   * Uses fmod command - OFF to turn off, FAN or AUTO to turn on.
   * When turning on, preserves auto mode if it was enabled.
   *
   * @param on - True to turn on, false to turn off
   */
  async setFanPower(on: boolean): Promise<void> {
    if (on) {
      // Turn on - use current auto mode setting or default to AUTO
      const mode = this.state.autoMode ? PROTOCOL.AUTO : PROTOCOL.FAN;
      await this.sendCommand({ fmod: mode });
    } else {
      // Turn off
      await this.sendCommand({ fmod: PROTOCOL.OFF });
    }
  }

  /**
   * Set fan speed
   *
   * @param speed - Fan speed (1-10) or -1 for auto mode
   */
  async setFanSpeed(speed: number): Promise<void> {
    if (speed < 0) {
      // Auto mode
      await this.sendCommand({ fmod: PROTOCOL.AUTO });
    } else {
      // Manual speed (1-10)
      const clampedSpeed = Math.max(FAN_SPEED.MIN, Math.min(FAN_SPEED.MAX, speed));
      const encodedSpeed = String(clampedSpeed).padStart(PROTOCOL.SPEED_PAD_LENGTH, '0');
      await this.sendCommand({
        fnsp: encodedSpeed,
        fmod: PROTOCOL.FAN,
      });
    }
  }

  /**
   * Set oscillation on or off
   *
   * @param on - True to enable oscillation, false to disable
   */
  async setOscillation(on: boolean): Promise<void> {
    await this.sendCommand({ oson: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set night mode on or off
   *
   * @param on - True to enable night mode, false to disable
   */
  async setNightMode(on: boolean): Promise<void> {
    await this.sendCommand({ nmod: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set continuous monitoring on or off
   *
   * When enabled, sensors remain active even when the fan is off.
   *
   * @param on - True to enable continuous monitoring, false to disable
   */
  async setContinuousMonitoring(on: boolean): Promise<void> {
    await this.sendCommand({ rhtm: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set auto mode on or off
   *
   * @param on - True to enable auto mode, false to disable
   */
  async setAutoMode(on: boolean): Promise<void> {
    if (on) {
      await this.sendCommand({ fmod: PROTOCOL.AUTO });
    } else {
      // When disabling auto, set to manual fan mode with current or default speed
      const currentSpeed = this.state.fanSpeed > 0 ? this.state.fanSpeed : FAN_SPEED.DEFAULT;
      const encodedSpeed = String(currentSpeed).padStart(PROTOCOL.SPEED_PAD_LENGTH, '0');
      await this.sendCommand({
        fmod: PROTOCOL.FAN,
        fnsp: encodedSpeed,
      });
    }
  }

  /**
   * Set jet focus (front airflow direction) on or off
   *
   * When enabled, air is directed in a focused stream.
   * When disabled, air is diffused for whole-room circulation.
   *
   * @param on - True to enable jet focus, false to disable
   */
  async setJetFocus(on: boolean): Promise<void> {
    await this.sendCommand({ ffoc: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set heating mode on or off (HP models only)
   *
   * @param on - True to enable heating, false to disable
   */
  async setHeating(on: boolean): Promise<void> {
    await this.sendCommand({ hmod: on ? PROTOCOL.HEAT : PROTOCOL.OFF });
  }

  /**
   * Set heating mode on or off (HP-series only)
   * Alias for setHeating with feature check.
   *
   * @param on - True to enable heating, false to disable
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
    // Clamp to valid range
    const clampedTemp = Math.max(
      HEATING_TEMP.MIN_CELSIUS,
      Math.min(HEATING_TEMP.MAX_CELSIUS, celsius),
    );
    // Convert to Kelvin * 10
    const kelvinTimes10 = Math.round(
      (clampedTemp + HEATING_TEMP.KELVIN_OFFSET) * HEATING_TEMP.KELVIN_MULTIPLIER,
    );
    await this.sendCommand({ hmax: String(kelvinTimes10) });
  }

  /**
   * Set humidifier mode on or off (PH models only)
   *
   * @param on - True to enable humidifier, false to disable
   */
  async setHumidifier(on: boolean): Promise<void> {
    await this.sendCommand({ hume: on ? PROTOCOL.ON : PROTOCOL.OFF });
  }

  /**
   * Set humidifier to auto mode (PH models only)
   *
   * In auto mode, the humidifier maintains optimal humidity automatically.
   */
  async setHumidifierAuto(): Promise<void> {
    await this.sendCommand({ hume: PROTOCOL.AUTO });
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
    await this.sendCommand({
      humt: String(clampedPercent).padStart(PROTOCOL.SPEED_PAD_LENGTH, '0'),
    });
  }

  /**
   * Get the device features
   *
   * @returns DeviceFeatures object describing what this device supports
   */
  getFeatures(): DeviceFeatures {
    return this.supportedFeatures;
  }

  /**
   * Handle state message from device
   *
   * Parses the device-specific state from CURRENT-STATE and STATE-CHANGE messages.
   *
   * @param data - Parsed message data
   */
  protected handleStateMessage(data: Record<string, unknown>): void {
    // Get state data from 'product-state' or 'data' field
    const productState = (data['product-state'] as Record<string, string>) ||
                         (data.data as Record<string, string>);

    if (!productState) {
      return;
    }

    const parsedState = this.codec.parseRawState(productState);

    if (Object.keys(parsedState).length > 0) {
      this.updateState(parsedState);
    }
  }
}

// Export constants for use in other modules
export { FAN_SPEED, HEATING_TEMP, HUMIDITY, PROTOCOL };
