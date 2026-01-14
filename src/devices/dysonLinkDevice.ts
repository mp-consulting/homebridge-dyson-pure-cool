/**
 * Dyson Link Device Class
 *
 * Concrete implementation for Dyson "Link" series devices (older models).
 * Supports fan control (power, speed, oscillation) for models like:
 * - 455: HP02 (Pure Hot+Cool Link)
 * - 438: TP04 (Pure Cool Tower)
 * - 438E: TP07 (Purifier Cool)
 */

import { DysonDevice } from './dysonDevice.js';
import type { DeviceFeatures, DeviceInfo } from './types.js';
import { DEFAULT_FEATURES } from './types.js';
import { MessageCodec } from '../protocol/messageCodec.js';
import type { MqttClientFactory } from './dysonDevice.js';
import type { MqttConnectFn } from '../protocol/mqttClient.js';

/**
 * Features supported by Link series devices
 */
const LINK_DEVICE_FEATURES: DeviceFeatures = {
  ...DEFAULT_FEATURES,
  fan: true,
  oscillation: true,
  autoMode: true,
  nightMode: true,
  frontAirflow: false,
  temperatureSensor: true,
  humiditySensor: true,
  airQualitySensor: true,
  heating: false,
  humidifier: false,
  hepaFilter: true,
  carbonFilter: true,
};

/**
 * Features for HP02 (455) which has heating
 */
const HP02_FEATURES: DeviceFeatures = {
  ...LINK_DEVICE_FEATURES,
  heating: true,
};

/**
 * Map product types to their feature sets
 */
const PRODUCT_FEATURES: Record<string, DeviceFeatures> = {
  '455': HP02_FEATURES,          // HP02 - Pure Hot+Cool Link
  '438': LINK_DEVICE_FEATURES,   // TP04 - Pure Cool Tower
  '438E': LINK_DEVICE_FEATURES,  // TP07 - Purifier Cool
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
    this.supportedFeatures = PRODUCT_FEATURES[deviceInfo.productType] || LINK_DEVICE_FEATURES;
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
