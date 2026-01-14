/**
 * Dyson Link Device Class
 *
 * Concrete implementation for Dyson devices.
 * Supports fan control, heating, humidification across all models.
 */

import { DysonDevice } from './dysonDevice.js';
import type { DeviceFeatures, DeviceInfo } from './types.js';
import { DEFAULT_FEATURES } from './types.js';
import { MessageCodec } from '../protocol/messageCodec.js';
import type { MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';

/**
 * Base features for Pure Cool devices (fans without heating/humidification)
 */
const PURE_COOL_FEATURES: DeviceFeatures = {
  ...DEFAULT_FEATURES,
  fan: true,
  oscillation: true,
  autoMode: true,
  nightMode: true,
  continuousMonitoring: true,
  frontAirflow: false,
  temperatureSensor: true,
  humiditySensor: true,
  airQualitySensor: true,
  no2Sensor: false,
  heating: false,
  humidifier: false,
  hepaFilter: true,
  carbonFilter: true,
};

/**
 * Features for Pure Cool with Jet Focus (newer models like TP04, DP04)
 */
const PURE_COOL_JET_FOCUS_FEATURES: DeviceFeatures = {
  ...PURE_COOL_FEATURES,
  frontAirflow: true,
};

/**
 * Features for Pure Cool Link (older models like TP02, DP01)
 */
const PURE_COOL_LINK_FEATURES: DeviceFeatures = {
  ...PURE_COOL_FEATURES,
  frontAirflow: false,
};

/**
 * Features for Pure Hot+Cool Link (HP02)
 */
const PURE_HOT_COOL_LINK_FEATURES: DeviceFeatures = {
  ...PURE_COOL_FEATURES,
  heating: true,
  frontAirflow: false,
};

/**
 * Features for Pure Hot+Cool (HP04, HP06, HP07, HP09)
 */
const PURE_HOT_COOL_FEATURES: DeviceFeatures = {
  ...PURE_COOL_FEATURES,
  heating: true,
  frontAirflow: true,
};

/**
 * Features for Purifier Humidify+Cool (PH01, PH02, PH03, PH04)
 */
const PURIFIER_HUMIDIFY_FEATURES: DeviceFeatures = {
  ...PURE_COOL_FEATURES,
  humidifier: true,
  frontAirflow: true,
};

/**
 * Features for Big+Quiet series (BP02, BP03, BP04, BP06)
 * These are large purifiers without oscillation but with advanced sensors
 */
const BIG_QUIET_FEATURES: DeviceFeatures = {
  ...PURE_COOL_FEATURES,
  oscillation: false,
  frontAirflow: false,
  no2Sensor: true,
};

/**
 * Features for Formaldehyde models (have NO2/HCHO sensors)
 */
const FORMALDEHYDE_FEATURES: DeviceFeatures = {
  ...PURE_COOL_JET_FOCUS_FEATURES,
  no2Sensor: true,
};

/**
 * Map product types to their feature sets
 */
const PRODUCT_FEATURES: Record<string, DeviceFeatures> = {
  // Pure Cool Link Tower (TP02)
  '475': PURE_COOL_LINK_FEATURES,

  // Pure Cool Desk Link (DP01)
  '469': PURE_COOL_LINK_FEATURES,

  // Pure Cool Tower (TP04, TP06)
  '438': PURE_COOL_JET_FOCUS_FEATURES,
  '358': PURE_COOL_JET_FOCUS_FEATURES,

  // Pure Cool Tower (TP07, newer naming)
  '438E': PURE_COOL_JET_FOCUS_FEATURES,
  '358E': PURE_COOL_JET_FOCUS_FEATURES,

  // Pure Cool Tower Formaldehyde (TP09)
  '438K': FORMALDEHYDE_FEATURES,

  // Pure Cool Desk (DP04)
  '520': PURE_COOL_JET_FOCUS_FEATURES,

  // Pure Hot+Cool Link (HP02)
  '455': PURE_HOT_COOL_LINK_FEATURES,

  // Pure Hot+Cool (HP04, HP06)
  '527': PURE_HOT_COOL_FEATURES,
  '358K': PURE_HOT_COOL_FEATURES,

  // Pure Hot+Cool (HP07)
  '527E': PURE_HOT_COOL_FEATURES,

  // Pure Hot+Cool Formaldehyde (HP09)
  '527K': { ...PURE_HOT_COOL_FEATURES, no2Sensor: true },

  // Purifier Humidify+Cool (PH01, PH02, PH03)
  '358J': PURIFIER_HUMIDIFY_FEATURES,
  '520E': PURIFIER_HUMIDIFY_FEATURES,
  '358H': PURIFIER_HUMIDIFY_FEATURES,

  // Purifier Humidify+Cool Formaldehyde (PH04)
  '520F': { ...PURIFIER_HUMIDIFY_FEATURES, no2Sensor: true },

  // Big+Quiet Series (BP02, BP03, BP04, BP06)
  '664': BIG_QUIET_FEATURES,
  '664B': BIG_QUIET_FEATURES,
  '664E': BIG_QUIET_FEATURES,
  '664F': BIG_QUIET_FEATURES,
};

/**
 * Dyson Link Device implementation
 *
 * Handles fan control for older Link series Dyson devices.
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
    this.supportedFeatures = PRODUCT_FEATURES[deviceInfo.productType] || PURE_COOL_FEATURES;
    this.codec = new MessageCodec();
  }

  /**
   * Set fan power on or off
   *
   * @param on - True to turn on, false to turn off
   */
  async setFanPower(on: boolean): Promise<void> {
    await this.sendCommand({ fpwr: on ? 'ON' : 'OFF' });
  }

  /**
   * Set fan speed
   *
   * @param speed - Fan speed (1-10) or -1 for auto mode
   */
  async setFanSpeed(speed: number): Promise<void> {
    if (speed < 0) {
      // Auto mode
      await this.sendCommand({ fmod: 'AUTO' });
    } else {
      // Manual speed (1-10)
      const clampedSpeed = Math.max(1, Math.min(10, speed));
      const encodedSpeed = String(clampedSpeed).padStart(4, '0');
      await this.sendCommand({
        fnsp: encodedSpeed,
        fmod: 'FAN',
      });
    }
  }

  /**
   * Set oscillation on or off
   *
   * @param on - True to enable oscillation, false to disable
   */
  async setOscillation(on: boolean): Promise<void> {
    await this.sendCommand({ oson: on ? 'ON' : 'OFF' });
  }

  /**
   * Set night mode on or off
   *
   * @param on - True to enable night mode, false to disable
   */
  async setNightMode(on: boolean): Promise<void> {
    await this.sendCommand({ nmod: on ? 'ON' : 'OFF' });
  }

  /**
   * Set continuous monitoring on or off
   *
   * When enabled, sensors remain active even when the fan is off.
   *
   * @param on - True to enable continuous monitoring, false to disable
   */
  async setContinuousMonitoring(on: boolean): Promise<void> {
    await this.sendCommand({ rhtm: on ? 'ON' : 'OFF' });
  }

  /**
   * Set auto mode on or off
   *
   * @param on - True to enable auto mode, false to disable
   */
  async setAutoMode(on: boolean): Promise<void> {
    if (on) {
      await this.sendCommand({ fmod: 'AUTO' });
    } else {
      // When disabling auto, set to manual fan mode with current or default speed
      const currentSpeed = this.state.fanSpeed > 0 ? this.state.fanSpeed : 4;
      const encodedSpeed = String(currentSpeed).padStart(4, '0');
      await this.sendCommand({
        fmod: 'FAN',
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
    await this.sendCommand({ ffoc: on ? 'ON' : 'OFF' });
  }

  /**
   * Set heating mode on or off (HP models only)
   *
   * @param on - True to enable heating, false to disable
   */
  async setHeating(on: boolean): Promise<void> {
    await this.sendCommand({ hmod: on ? 'HEAT' : 'OFF' });
  }

  /**
   * Set target temperature for heating (HP models only)
   *
   * @param celsius - Target temperature in Celsius (1-37)
   */
  async setTargetTemperature(celsius: number): Promise<void> {
    // Clamp to valid range (1-37°C)
    const clampedTemp = Math.max(1, Math.min(37, celsius));
    // Convert to Kelvin * 10
    const kelvinTimes10 = Math.round((clampedTemp + 273.15) * 10);
    await this.sendCommand({ hmax: String(kelvinTimes10) });
  }

  /**
   * Set humidifier mode on or off (PH models only)
   *
   * @param on - True to enable humidifier, false to disable
   */
  async setHumidifier(on: boolean): Promise<void> {
    await this.sendCommand({ hume: on ? 'ON' : 'OFF' });
  }

  /**
   * Set humidifier to auto mode (PH models only)
   *
   * In auto mode, the humidifier maintains optimal humidity automatically.
   */
  async setHumidifierAuto(): Promise<void> {
    await this.sendCommand({ hume: 'AUTO' });
  }

  /**
   * Set target humidity percentage (PH models only)
   *
   * @param percent - Target humidity (30-70, or 0-100 if full range enabled)
   */
  async setTargetHumidity(percent: number): Promise<void> {
    // Default range is 30-70%, but can be extended to 0-100%
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    await this.sendCommand({ humt: String(clampedPercent).padStart(4, '0') });
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
