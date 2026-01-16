/**
 * Message Codec for Dyson Protocol
 *
 * Encodes commands and decodes state messages for Dyson devices.
 * Handles conversions between HomeKit values and Dyson protocol format.
 */

import type { DeviceState } from '../devices/types.js';

// ============================================================================
// Constants - No Magic Numbers
// ============================================================================

/** Fan speed limits */
const FAN_SPEED = {
  MIN: 1,
  MAX: 10,
  AUTO: -1,
} as const;

/** Oscillation angle limits */
const OSCILLATION_ANGLE = {
  MIN: 45,
  MAX: 355,
} as const;

/** Temperature conversion constants */
const TEMPERATURE = {
  /** Kelvin to Celsius offset */
  KELVIN_OFFSET: 273.15,
  /** Dyson uses Kelvin * 10 for precision */
  KELVIN_MULTIPLIER: 10,
} as const;

/** Filter life constants */
const FILTER = {
  /** Maximum filter life in hours */
  MAX_HOURS: 4300,
  /** Percentage divisor for conversion */
  PERCENT_DIVISOR: 100,
} as const;

/** Protocol string formatting */
const FORMAT = {
  /** Padding length for numeric values */
  PAD_LENGTH: 4,
  /** Padding character */
  PAD_CHAR: '0',
} as const;

/** HomeKit percentage range */
const PERCENT = {
  MIN: 0,
  MAX: 100,
  /** Conversion factor for speed (10% per speed level) */
  PER_SPEED_LEVEL: 10,
} as const;

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
 * Values can be either strings or arrays [oldValue, newValue] for STATE-CHANGE messages
 */
export interface RawStateData {
  fpwr?: string | [string, string];
  fmod?: string | [string, string];
  fnsp?: string | [string, string];
  oson?: string | [string, string];
  oscs?: string | [string, string];
  osce?: string | [string, string];
  nmod?: string | [string, string];
  rhtm?: string | [string, string];
  ffoc?: string | [string, string];
  hmod?: string | [string, string];
  hmax?: string | [string, string];
  hume?: string | [string, string];
  humt?: string | [string, string];
  tact?: string | [string, string];
  hact?: string | [string, string];
  p25r?: string | [string, string];
  p10r?: string | [string, string];
  pact?: string | [string, string];
  va10?: string | [string, string];
  vact?: string | [string, string];
  noxl?: string | [string, string];
  hchr?: string | [string, string];
  filf?: string | [string, string];
  fltf?: string | [string, string];
  cflr?: string | [string, string];
  [key: string]: string | [string, string] | undefined;
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
   * Extract value from raw state field
   * Handles both direct values ("ON") and change arrays (["OFF", "ON"])
   *
   * @param value - Raw value from state data
   * @returns The actual string value (newest for arrays)
   */
  private extractValue(value: string | [string, string] | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    // STATE-CHANGE messages use [oldValue, newValue] format
    if (Array.isArray(value)) {
      return value[1]; // Return the new value
    }
    return value;
  }
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
      encodedData.humt = String(data.targetHumidity).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
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
   * Handles both CURRENT-STATE (direct values) and STATE-CHANGE ([old, new] arrays)
   */
  parseRawState(raw: RawStateData): Partial<DeviceState> {
    const state: Partial<DeviceState> = {};

    // Fan power
    const fpwr = this.extractValue(raw.fpwr);
    if (fpwr !== undefined) {
      state.isOn = fpwr === 'ON';
    }

    // Fan speed
    const fnsp = this.extractValue(raw.fnsp);
    if (fnsp !== undefined) {
      const { speed, autoMode } = this.decodeFanSpeed(fnsp);
      state.fanSpeed = speed;
      state.autoMode = autoMode;
    }

    // Fan mode (also indicates power and auto mode)
    // fmod: 'OFF' = device off, 'FAN' = manual mode on, 'AUTO' = auto mode on
    const fmod = this.extractValue(raw.fmod);
    if (fmod !== undefined) {
      if (fmod === 'OFF') {
        state.isOn = false;
        state.autoMode = false;
      } else if (fmod === 'AUTO') {
        state.isOn = true;
        state.autoMode = true;
      } else if (fmod === 'FAN') {
        state.isOn = true;
        state.autoMode = false;
      }
    }

    // Oscillation
    const oson = this.extractValue(raw.oson);
    if (oson !== undefined) {
      state.oscillation = oson === 'ON';
    }

    // Oscillation angles
    const oscs = this.extractValue(raw.oscs);
    if (oscs !== undefined) {
      state.oscillationAngleStart = parseInt(oscs, 10);
    }
    const osce = this.extractValue(raw.osce);
    if (osce !== undefined) {
      state.oscillationAngleEnd = parseInt(osce, 10);
    }

    // Night mode
    const nmod = this.extractValue(raw.nmod);
    if (nmod !== undefined) {
      state.nightMode = nmod === 'ON';
    }

    // Continuous monitoring
    const rhtm = this.extractValue(raw.rhtm);
    if (rhtm !== undefined) {
      state.continuousMonitoring = rhtm === 'ON';
    }

    // Front airflow
    const ffoc = this.extractValue(raw.ffoc);
    if (ffoc !== undefined) {
      state.frontAirflow = ffoc === 'ON';
    }

    // Temperature (Kelvin * 10)
    const tact = this.extractValue(raw.tact);
    if (tact !== undefined && tact !== 'OFF') {
      state.temperature = parseInt(tact, 10);
    }

    // Humidity percentage
    const hact = this.extractValue(raw.hact);
    if (hact !== undefined && hact !== 'OFF') {
      state.humidity = parseInt(hact, 10);
    }

    // Air quality sensors - advanced models use p25r/p10r, basic use pact
    const p25r = this.extractValue(raw.p25r);
    if (p25r !== undefined && p25r !== 'INIT' && p25r !== 'OFF') {
      const value = parseInt(p25r, 10);
      if (!isNaN(value)) {
        state.pm25 = value;
      }
    }
    const p10r = this.extractValue(raw.p10r);
    if (p10r !== undefined && p10r !== 'INIT' && p10r !== 'OFF') {
      const value = parseInt(p10r, 10);
      if (!isNaN(value)) {
        state.pm10 = value;
      }
    }
    // Basic sensors use pact for particulate index (not µg/m³)
    const pact = this.extractValue(raw.pact);
    if (pact !== undefined && pact !== 'INIT' && pact !== 'OFF') {
      const value = parseInt(pact, 10);
      if (!isNaN(value)) {
        state.pm25 = value;
      }
    }
    // VOC - va10 for advanced, vact for basic
    const va10 = this.extractValue(raw.va10);
    if (va10 !== undefined && va10 !== 'INIT' && va10 !== 'OFF') {
      const value = parseInt(va10, 10);
      if (!isNaN(value)) {
        state.vocIndex = value;
      }
    }
    const vact = this.extractValue(raw.vact);
    if (vact !== undefined && vact !== 'INIT' && vact !== 'OFF') {
      const value = parseInt(vact, 10);
      if (!isNaN(value)) {
        state.vocIndex = value;
      }
    }
    // NO2 index
    const noxl = this.extractValue(raw.noxl);
    if (noxl !== undefined && noxl !== 'INIT' && noxl !== 'OFF') {
      const value = parseInt(noxl, 10);
      if (!isNaN(value)) {
        state.no2Index = value;
      }
    }

    // Filter status
    const filf = this.extractValue(raw.filf);
    if (filf !== undefined) {
      // HEPA filter life in hours
      state.hepaFilterLife = parseInt(filf, 10);
    }
    const fltf = this.extractValue(raw.fltf);
    if (fltf !== undefined) {
      // HEPA filter percentage - convert to hours estimate
      const percent = parseInt(fltf, 10);
      state.hepaFilterLife = Math.round((percent / FILTER.PERCENT_DIVISOR) * FILTER.MAX_HOURS);
    }
    const cflr = this.extractValue(raw.cflr);
    if (cflr !== undefined) {
      // Carbon filter percentage - convert to hours estimate
      const percent = parseInt(cflr, 10);
      state.carbonFilterLife = Math.round((percent / FILTER.PERCENT_DIVISOR) * FILTER.MAX_HOURS);
    }

    // Heating (HP models)
    const hmod = this.extractValue(raw.hmod);
    if (hmod !== undefined) {
      state.heatingEnabled = hmod === 'HEAT';
    }
    const hmax = this.extractValue(raw.hmax);
    if (hmax !== undefined) {
      state.targetTemperature = parseInt(hmax, 10);
    }

    // Humidifier (PH models)
    const hume = this.extractValue(raw.hume);
    if (hume !== undefined) {
      state.humidifierEnabled = hume === 'ON' || hume === 'AUTO';
    }
    const humt = this.extractValue(raw.humt);
    if (humt !== undefined) {
      state.targetHumidity = parseInt(humt, 10);
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
    const clampedSpeed = Math.max(FAN_SPEED.MIN, Math.min(FAN_SPEED.MAX, speed));
    return String(clampedSpeed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
  }

  /**
   * Decode fan speed from Dyson format
   *
   * @param encoded - Encoded speed (e.g., "0005" or "AUTO")
   * @returns Object with speed (1-10 or -1 for AUTO) and autoMode flag
   */
  decodeFanSpeed(encoded: string): { speed: number; autoMode: boolean } {
    if (encoded === 'AUTO') {
      return { speed: FAN_SPEED.AUTO, autoMode: true };
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
    if (percent <= PERCENT.MIN) {
      return FAN_SPEED.MIN;
    }
    return Math.max(
      FAN_SPEED.MIN,
      Math.min(FAN_SPEED.MAX, Math.ceil(percent / PERCENT.PER_SPEED_LEVEL)),
    );
  }

  /**
   * Convert Dyson speed (1-10) to HomeKit percentage (0-100)
   *
   * @param speed - Dyson speed (1-10) or -1 for AUTO
   * @returns HomeKit percentage (0-100)
   */
  speedToPercent(speed: number): number {
    if (speed < 0) {
      return PERCENT.MAX; // AUTO shows as 100%
    }
    // Map 1-10 to 10-100% (in steps of 10)
    return Math.max(PERCENT.MIN, Math.min(PERCENT.MAX, speed * PERCENT.PER_SPEED_LEVEL));
  }

  /**
   * Encode oscillation angle to Dyson format
   *
   * @param angle - Angle in degrees (45-355)
   * @returns Encoded angle string (e.g., "0045")
   */
  encodeAngle(angle: number): string {
    const clampedAngle = Math.max(OSCILLATION_ANGLE.MIN, Math.min(OSCILLATION_ANGLE.MAX, angle));
    return String(clampedAngle).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
  }

  /**
   * Encode temperature from Celsius to Dyson format (Kelvin * 10)
   *
   * @param celsius - Temperature in Celsius
   * @returns Encoded temperature string (e.g., "2950" for 22°C)
   */
  encodeTemperature(celsius: number): string {
    const kelvinTimes10 = Math.round(
      (celsius + TEMPERATURE.KELVIN_OFFSET) * TEMPERATURE.KELVIN_MULTIPLIER,
    );
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
    return (kelvinTimes10 / TEMPERATURE.KELVIN_MULTIPLIER) - TEMPERATURE.KELVIN_OFFSET;
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
