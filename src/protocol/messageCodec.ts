/**
 * Message Codec for Dyson Protocol
 *
 * Encodes commands and decodes state messages for Dyson devices.
 * Handles conversions between HomeKit values and Dyson protocol format.
 */

import type { DeviceState } from '../devices/types.js';

/**
 * Command data that can be sent to a Dyson device
 */
export interface CommandData {
  /** Fan power (ON/OFF) */
  fanPower?: boolean;
  /** Fan speed (1-10, or -1 for AUTO) */
  fanSpeed?: number;
  /** Fan mode (OFF, FAN, AUTO) */
  fanMode?: 'OFF' | 'FAN' | 'AUTO';
  /** Oscillation enabled */
  oscillation?: boolean;
  /** Oscillation start angle (45-355) */
  oscillationAngleStart?: number;
  /** Oscillation end angle (45-355) */
  oscillationAngleEnd?: number;
  /** Night mode enabled */
  nightMode?: boolean;
  /** Continuous monitoring enabled */
  continuousMonitoring?: boolean;
  /** Jet focus / front airflow enabled */
  frontAirflow?: boolean;
  /** Heating mode enabled (HP models) */
  heatingMode?: boolean;
  /** Target temperature in Celsius (HP models) */
  targetTemperature?: number;
  /** Humidifier enabled (PH models) */
  humidifierMode?: boolean;
  /** Target humidity percentage (PH models) */
  targetHumidity?: number;
}

/**
 * Raw Dyson protocol state data
 */
export interface RawStateData {
  fpwr?: string;
  fmod?: string;
  fnsp?: string;
  oson?: string;
  oscs?: string;
  osce?: string;
  nmod?: string;
  rhtm?: string;
  ffoc?: string;
  hmod?: string;
  hmax?: string;
  hume?: string;
  humt?: string;
  tact?: string;
  hact?: string;
  pm25?: string;
  pm10?: string;
  pact?: string;
  va10?: string;
  vact?: string;
  noxl?: string;
  filf?: string;
  fltf?: string;
  cflr?: string;
  [key: string]: string | undefined;
}

/**
 * Dyson protocol message structure
 */
export interface DysonMessage {
  msg: string;
  time?: string;
  'mode-reason'?: string;
  data?: RawStateData;
  'product-state'?: RawStateData;
}

/**
 * Message codec for encoding commands and decoding state
 */
export class MessageCodec {
  /**
   * Encode a command to send to the device
   *
   * @param data - Command data to encode
   * @returns JSON string to publish to command topic
   */
  encodeCommand(data: Partial<CommandData>): string {
    const encodedData: Record<string, string> = {};

    // Fan power
    if (data.fanPower !== undefined) {
      encodedData.fpwr = data.fanPower ? 'ON' : 'OFF';
    }

    // Fan speed
    if (data.fanSpeed !== undefined) {
      encodedData.fnsp = this.encodeFanSpeed(data.fanSpeed);
    }

    // Fan mode
    if (data.fanMode !== undefined) {
      encodedData.fmod = data.fanMode;
    }

    // Oscillation
    if (data.oscillation !== undefined) {
      encodedData.oson = data.oscillation ? 'ON' : 'OFF';
    }

    // Oscillation angles
    if (data.oscillationAngleStart !== undefined) {
      encodedData.oscs = this.encodeAngle(data.oscillationAngleStart);
    }
    if (data.oscillationAngleEnd !== undefined) {
      encodedData.osce = this.encodeAngle(data.oscillationAngleEnd);
    }

    // Night mode
    if (data.nightMode !== undefined) {
      encodedData.nmod = data.nightMode ? 'ON' : 'OFF';
    }

    // Continuous monitoring
    if (data.continuousMonitoring !== undefined) {
      encodedData.rhtm = data.continuousMonitoring ? 'ON' : 'OFF';
    }

    // Front airflow / jet focus
    if (data.frontAirflow !== undefined) {
      encodedData.ffoc = data.frontAirflow ? 'ON' : 'OFF';
    }

    // Heating mode (HP models)
    if (data.heatingMode !== undefined) {
      encodedData.hmod = data.heatingMode ? 'HEAT' : 'OFF';
    }

    // Target temperature (HP models) - convert Celsius to Kelvin * 10
    if (data.targetTemperature !== undefined) {
      encodedData.hmax = this.encodeTemperature(data.targetTemperature);
    }

    // Humidifier mode (PH models)
    if (data.humidifierMode !== undefined) {
      encodedData.hume = data.humidifierMode ? 'ON' : 'OFF';
    }

    // Target humidity (PH models)
    if (data.targetHumidity !== undefined) {
      encodedData.humt = String(data.targetHumidity).padStart(4, '0');
    }

    const message: DysonMessage = {
      msg: 'STATE-SET',
      time: new Date().toISOString(),
      'mode-reason': 'LAPP',
      data: encodedData,
    };

    return JSON.stringify(message);
  }

  /**
   * Decode a state message from the device
   *
   * @param payload - Raw message payload (Buffer or object)
   * @returns Partial device state
   */
  decodeState(payload: Buffer | DysonMessage): Partial<DeviceState> {
    let message: DysonMessage;

    if (Buffer.isBuffer(payload)) {
      try {
        message = JSON.parse(payload.toString('utf8')) as DysonMessage;
      } catch {
        return {};
      }
    } else {
      message = payload;
    }

    // Get state data from either 'data' or 'product-state' field
    const rawState = message['product-state'] || message.data;
    if (!rawState) {
      return {};
    }

    return this.parseRawState(rawState);
  }

  /**
   * Parse raw state data into DeviceState
   */
  parseRawState(raw: RawStateData): Partial<DeviceState> {
    const state: Partial<DeviceState> = {};

    // Fan power
    if (raw.fpwr !== undefined) {
      state.isOn = raw.fpwr === 'ON';
    }

    // Fan speed
    if (raw.fnsp !== undefined) {
      const { speed, autoMode } = this.decodeFanSpeed(raw.fnsp);
      state.fanSpeed = speed;
      state.autoMode = autoMode;
    }

    // Fan mode (also indicates auto mode)
    if (raw.fmod !== undefined) {
      if (raw.fmod === 'AUTO') {
        state.autoMode = true;
      } else if (raw.fmod === 'OFF') {
        state.isOn = false;
      }
    }

    // Oscillation
    if (raw.oson !== undefined) {
      state.oscillation = raw.oson === 'ON';
    }

    // Oscillation angles
    if (raw.oscs !== undefined) {
      state.oscillationAngleStart = parseInt(raw.oscs, 10);
    }
    if (raw.osce !== undefined) {
      state.oscillationAngleEnd = parseInt(raw.osce, 10);
    }

    // Night mode
    if (raw.nmod !== undefined) {
      state.nightMode = raw.nmod === 'ON';
    }

    // Front airflow
    if (raw.ffoc !== undefined) {
      state.frontAirflow = raw.ffoc === 'ON';
    }

    // Temperature (Kelvin * 10)
    if (raw.tact !== undefined && raw.tact !== 'OFF') {
      state.temperature = parseInt(raw.tact, 10);
    }

    // Humidity percentage
    if (raw.hact !== undefined && raw.hact !== 'OFF') {
      state.humidity = parseInt(raw.hact, 10);
    }

    // Air quality sensors
    if (raw.pm25 !== undefined) {
      state.pm25 = parseInt(raw.pm25, 10);
    }
    if (raw.pm10 !== undefined) {
      state.pm10 = parseInt(raw.pm10, 10);
    }
    if (raw.pact !== undefined) {
      // Some models use pact for PM2.5
      state.pm25 = parseInt(raw.pact, 10);
    }
    if (raw.va10 !== undefined) {
      state.vocIndex = parseInt(raw.va10, 10);
    }
    if (raw.vact !== undefined) {
      // Some models use vact
      state.vocIndex = parseInt(raw.vact, 10);
    }
    if (raw.noxl !== undefined) {
      state.no2Index = parseInt(raw.noxl, 10);
    }

    // Filter status
    if (raw.filf !== undefined) {
      // HEPA filter life in hours
      state.hepaFilterLife = parseInt(raw.filf, 10);
    }
    if (raw.fltf !== undefined) {
      // HEPA filter percentage - convert to hours estimate (4300 hours max)
      const percent = parseInt(raw.fltf, 10);
      state.hepaFilterLife = Math.round((percent / 100) * 4300);
    }
    if (raw.cflr !== undefined) {
      // Carbon filter percentage - convert to hours estimate (4300 hours max)
      const percent = parseInt(raw.cflr, 10);
      state.carbonFilterLife = Math.round((percent / 100) * 4300);
    }

    // Heating (HP models)
    if (raw.hmod !== undefined) {
      state.heatingEnabled = raw.hmod === 'HEAT';
    }
    if (raw.hmax !== undefined) {
      state.targetTemperature = parseInt(raw.hmax, 10);
    }

    // Humidifier (PH models)
    if (raw.hume !== undefined) {
      state.humidifierEnabled = raw.hume === 'ON' || raw.hume === 'AUTO';
    }
    if (raw.humt !== undefined) {
      state.targetHumidity = parseInt(raw.humt, 10);
    }

    return state;
  }

  /**
   * Encode fan speed (1-10 or -1 for AUTO) to Dyson format
   *
   * @param speed - Fan speed (1-10) or -1 for AUTO
   * @returns Encoded speed string (e.g., "0005" or "AUTO")
   */
  encodeFanSpeed(speed: number): string {
    if (speed < 0) {
      return 'AUTO';
    }
    // Clamp to 1-10 range
    const clampedSpeed = Math.max(1, Math.min(10, speed));
    return String(clampedSpeed).padStart(4, '0');
  }

  /**
   * Decode fan speed from Dyson format
   *
   * @param encoded - Encoded speed (e.g., "0005" or "AUTO")
   * @returns Object with speed (1-10 or -1 for AUTO) and autoMode flag
   */
  decodeFanSpeed(encoded: string): { speed: number; autoMode: boolean } {
    if (encoded === 'AUTO') {
      return { speed: -1, autoMode: true };
    }
    const speed = parseInt(encoded, 10);
    return { speed: isNaN(speed) ? 0 : speed, autoMode: false };
  }

  /**
   * Convert HomeKit percentage (0-100) to Dyson speed (1-10)
   *
   * @param percent - HomeKit percentage (0-100)
   * @returns Dyson speed (1-10)
   */
  percentToSpeed(percent: number): number {
    if (percent <= 0) {
      return 1;
    }
    // Map 1-100% to 1-10
    return Math.max(1, Math.min(10, Math.ceil(percent / 10)));
  }

  /**
   * Convert Dyson speed (1-10) to HomeKit percentage (0-100)
   *
   * @param speed - Dyson speed (1-10) or -1 for AUTO
   * @returns HomeKit percentage (0-100)
   */
  speedToPercent(speed: number): number {
    if (speed < 0) {
      return 100; // AUTO shows as 100%
    }
    // Map 1-10 to 10-100% (in steps of 10)
    return Math.max(0, Math.min(100, speed * 10));
  }

  /**
   * Encode oscillation angle to Dyson format
   *
   * @param angle - Angle in degrees (45-355)
   * @returns Encoded angle string (e.g., "0045")
   */
  encodeAngle(angle: number): string {
    const clampedAngle = Math.max(45, Math.min(355, angle));
    return String(clampedAngle).padStart(4, '0');
  }

  /**
   * Encode temperature from Celsius to Dyson format (Kelvin * 10)
   *
   * @param celsius - Temperature in Celsius
   * @returns Encoded temperature string (e.g., "2950" for 22°C)
   */
  encodeTemperature(celsius: number): string {
    // Celsius to Kelvin, then * 10
    const kelvinTimes10 = Math.round((celsius + 273.15) * 10);
    return String(kelvinTimes10);
  }

  /**
   * Decode temperature from Dyson format to Celsius
   *
   * @param encoded - Encoded temperature (Kelvin * 10)
   * @returns Temperature in Celsius
   */
  decodeTemperature(encoded: string | number): number {
    const kelvinTimes10 = typeof encoded === 'string' ? parseInt(encoded, 10) : encoded;
    // Kelvin * 10 to Celsius
    return (kelvinTimes10 / 10) - 273.15;
  }

  /**
   * Create a REQUEST-CURRENT-STATE message
   *
   * @returns JSON string for requesting current state
   */
  encodeRequestState(): string {
    return JSON.stringify({
      msg: 'REQUEST-CURRENT-STATE',
      time: new Date().toISOString(),
    });
  }
}

// Export singleton instance for convenience
export const messageCodec = new MessageCodec();
