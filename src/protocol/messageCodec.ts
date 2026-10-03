/**
 * Message Codec for Dyson Protocol
 *
 * Encodes commands and decodes state messages for Dyson devices.
 * Handles conversions between HomeKit values and Dyson protocol format.
 * All methods are static - no instance state needed.
 */

import type { DeviceState } from '../devices/types.js';

// ============================================================================
// Constants - Exported for shared use across modules
// ============================================================================

/** Fan speed limits */
export const FAN_SPEED = {
  MIN: 1,
  MAX: 10,
  DEFAULT: 4,
  AUTO: -1,
} as const;

/** Temperature conversion constants */
export const TEMPERATURE = {
  /** Kelvin to Celsius offset */
  KELVIN_OFFSET: 273.15,
  /** Dyson uses Kelvin * 10 for precision */
  KELVIN_MULTIPLIER: 10,
} as const;

/** Heating temperature limits (Celsius) */
export const HEATING_TEMP = {
  MIN_CELSIUS: 1,
  MAX_CELSIUS: 37,
} as const;

/** Humidity limits for humidifier */
export const HUMIDITY = {
  MIN_PERCENT: 0,
  MAX_PERCENT: 100,
  DEFAULT_MIN: 30,
  DEFAULT_MAX: 70,
} as const;

/** Filter life constants */
export const FILTER = {
  /** Maximum filter life in hours */
  MAX_HOURS: 4300,
  /** Percentage divisor for conversion */
  PERCENT_DIVISOR: 100,
} as const;

/** Protocol string formatting */
export const FORMAT = {
  /** Padding length for numeric values */
  PAD_LENGTH: 4,
  /** Padding character */
  PAD_CHAR: '0',
} as const;

/** Dyson protocol values */
export const PROTOCOL = {
  ON: 'ON',
  OFF: 'OFF',
  AUTO: 'AUTO',
  FAN: 'FAN',
  HEAT: 'HEAT',
} as const;

/** HomeKit percentage range */
export const PERCENT = {
  MIN: 0,
  MAX: 100,
  /** Conversion factor for speed (10% per speed level) */
  PER_SPEED_LEVEL: 10,
} as const;

/**
 * Raw Dyson protocol state data
 * Values can be either strings or arrays [oldValue, newValue] for STATE-CHANGE messages
 */
export interface RawStateData {
  fpwr?: string | [string, string];
  fmod?: string | [string, string];
  auto?: string | [string, string];
  fnsp?: string | [string, string];
  fnst?: string | [string, string];
  qtar?: string | [string, string];
  oson?: string | [string, string];
  oscs?: string | [string, string];
  osce?: string | [string, string];
  nmod?: string | [string, string];
  rhtm?: string | [string, string];
  ffoc?: string | [string, string];
  hmod?: string | [string, string];
  hmax?: string | [string, string];
  hsta?: string | [string, string];
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
  sltm?: string | [string, string];
  ercd?: string | [string, string];
  wacd?: string | [string, string];
  tilt?: string | [string, string];
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
 * Message codec for encoding commands and decoding state.
 * All methods are static since the codec is stateless.
 */
export class MessageCodec {
  /**
   * Extract value from raw state field
   * Handles both direct values ("ON") and change arrays (["OFF", "ON"])
   */
  static extractValue(value: string | [string, string] | undefined): string | undefined {
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
   * Parse raw state data into DeviceState
   * Handles both CURRENT-STATE (direct values) and STATE-CHANGE ([old, new] arrays)
   */
  static parseRawState(raw: RawStateData): Partial<DeviceState> {
    const state: Partial<DeviceState> = {};

    // Fan power
    const fpwr = MessageCodec.extractValue(raw.fpwr);
    if (fpwr !== undefined) {
      state.isOn = fpwr === PROTOCOL.ON;
    }

    // Fan speed
    const fnsp = MessageCodec.extractValue(raw.fnsp);
    if (fnsp !== undefined) {
      const { speed } = MessageCodec.decodeFanSpeed(fnsp);
      state.fanSpeed = speed;
    }

    // Fan mode (also indicates power and auto mode)
    const fmod = MessageCodec.extractValue(raw.fmod);
    if (fmod !== undefined) {
      if (fmod === PROTOCOL.OFF) {
        state.isOn = false;
        state.autoMode = false;
      } else if (fmod === PROTOCOL.AUTO) {
        state.isOn = true;
        state.autoMode = true;
      } else if (fmod === PROTOCOL.FAN) {
        state.isOn = true;
        state.autoMode = false;
      }
    }

    // Auto mode field (some devices send this separately from fmod)
    const auto = MessageCodec.extractValue(raw.auto);
    if (auto !== undefined) {
      state.autoMode = auto === PROTOCOL.ON;
    }

    // Oscillation
    const oson = MessageCodec.extractValue(raw.oson);
    if (oson !== undefined) {
      state.oscillation = oson === PROTOCOL.ON;
    }

    // Oscillation angles
    const oscs = MessageCodec.extractValue(raw.oscs);
    if (oscs !== undefined) {
      const angle = parseInt(oscs, 10);
      if (!isNaN(angle)) {
        state.oscillationAngleStart = angle;
      }
    }
    const osce = MessageCodec.extractValue(raw.osce);
    if (osce !== undefined) {
      const angle = parseInt(osce, 10);
      if (!isNaN(angle)) {
        state.oscillationAngleEnd = angle;
      }
    }

    // Night mode
    const nmod = MessageCodec.extractValue(raw.nmod);
    if (nmod !== undefined) {
      state.nightMode = nmod === PROTOCOL.ON;
    }

    // Continuous monitoring
    const rhtm = MessageCodec.extractValue(raw.rhtm);
    if (rhtm !== undefined) {
      state.continuousMonitoring = rhtm === PROTOCOL.ON;
    }

    // Front airflow
    const ffoc = MessageCodec.extractValue(raw.ffoc);
    if (ffoc !== undefined) {
      state.frontAirflow = ffoc === PROTOCOL.ON;
    }

    // Environmental sensor data
    MessageCodec.parseEnvironmentalData(raw, state);

    // Filter status
    MessageCodec.parseFilterData(raw, state);

    // Heating (HP models)
    MessageCodec.parseHeatingData(raw, state);

    // Humidifier (PH models)
    MessageCodec.parseHumidifierData(raw, state);

    // Link series specific fields
    MessageCodec.parseLinkSeriesData(raw, state);

    return state;
  }

  /**
   * Parse environmental sensor data from raw state
   */
  static parseEnvironmentalData(raw: RawStateData, state: Partial<DeviceState>): void {
    // Temperature (Kelvin * 10)
    const tact = MessageCodec.extractValue(raw.tact);
    if (tact !== undefined && tact !== PROTOCOL.OFF) {
      const value = parseInt(tact, 10);
      if (!isNaN(value)) {
        state.temperature = value;
      }
    }

    // Humidity percentage
    const hact = MessageCodec.extractValue(raw.hact);
    if (hact !== undefined && hact !== PROTOCOL.OFF) {
      const value = parseInt(hact, 10);
      if (!isNaN(value)) {
        state.humidity = value;
      }
    }

    // PM2.5 - newer models use p25r, older Link models use pact
    const p25r = MessageCodec.extractValue(raw.p25r);
    if (p25r !== undefined && p25r !== 'INIT' && p25r !== PROTOCOL.OFF) {
      const value = parseInt(p25r, 10);
      if (!isNaN(value)) {
        state.pm25 = value;
      }
    }
    const p10r = MessageCodec.extractValue(raw.p10r);
    if (p10r !== undefined && p10r !== 'INIT' && p10r !== PROTOCOL.OFF) {
      const value = parseInt(p10r, 10);
      if (!isNaN(value)) {
        state.pm10 = value;
      }
    }
    // pact is the 0-9 index of older Link models; never let it overwrite a
    // real p25r density from the same message
    const pact = MessageCodec.extractValue(raw.pact);
    if (state.pm25 === undefined && pact !== undefined && pact !== 'INIT' && pact !== PROTOCOL.OFF) {
      const value = parseInt(pact, 10);
      if (!isNaN(value)) {
        state.pm25 = value;
      }
    }
    // VOC - va10 for advanced, vact for basic
    const va10 = MessageCodec.extractValue(raw.va10);
    if (va10 !== undefined && va10 !== 'INIT' && va10 !== PROTOCOL.OFF) {
      const value = parseInt(va10, 10);
      if (!isNaN(value)) {
        state.vocIndex = value;
      }
    }
    // vact (basic sensors) only applies when there is no va10 reading
    const vact = MessageCodec.extractValue(raw.vact);
    if (state.vocIndex === undefined && vact !== undefined && vact !== 'INIT' && vact !== PROTOCOL.OFF) {
      const value = parseInt(vact, 10);
      if (!isNaN(value)) {
        state.vocIndex = value;
      }
    }
    // NO2 index
    const noxl = MessageCodec.extractValue(raw.noxl);
    if (noxl !== undefined && noxl !== 'INIT' && noxl !== PROTOCOL.OFF) {
      const value = parseInt(noxl, 10);
      if (!isNaN(value)) {
        state.no2Index = value;
      }
    }
    // Formaldehyde (HCHO) level
    const hchr = MessageCodec.extractValue(raw.hchr);
    if (hchr !== undefined && hchr !== 'INIT' && hchr !== PROTOCOL.OFF) {
      const value = parseInt(hchr, 10);
      if (!isNaN(value)) {
        state.formaldehydeLevel = value;
      }
    }

    // Sleep timer
    const sltm = MessageCodec.extractValue(raw.sltm);
    if (sltm !== undefined) {
      if (sltm === PROTOCOL.OFF) {
        state.sleepTimer = 0;
      } else {
        const value = parseInt(sltm, 10);
        if (!isNaN(value)) {
          state.sleepTimer = value;
        }
      }
    }
  }

  /**
   * Parse filter status from raw state
   */
  private static parseFilterData(raw: RawStateData, state: Partial<DeviceState>): void {
    // Link models report HEPA life in hours remaining; newer models report
    // percentages. State always holds a percentage (0-100).
    const filf = MessageCodec.extractValue(raw.filf);
    if (filf !== undefined) {
      const hours = parseInt(filf, 10);
      if (!isNaN(hours)) {
        state.hepaFilterLife = MessageCodec.clampPercent((hours / FILTER.MAX_HOURS) * FILTER.PERCENT_DIVISOR);
      }
    }

    const fltf = MessageCodec.extractValue(raw.fltf);
    if (fltf !== undefined) {
      const percent = parseInt(fltf, 10);
      if (!isNaN(percent)) {
        state.hepaFilterLife = MessageCodec.clampPercent(percent);
      }
    }

    const cflr = MessageCodec.extractValue(raw.cflr);
    if (cflr !== undefined) {
      const percent = parseInt(cflr, 10);
      if (!isNaN(percent)) {
        state.carbonFilterLife = MessageCodec.clampPercent(percent);
      }
    }
  }

  private static clampPercent(value: number): number {
    return Math.max(PERCENT.MIN, Math.min(PERCENT.MAX, Math.round(value)));
  }

  /**
   * Parse heating data from raw state (HP models)
   */
  private static parseHeatingData(raw: RawStateData, state: Partial<DeviceState>): void {
    const hmod = MessageCodec.extractValue(raw.hmod);
    if (hmod !== undefined) {
      state.heatingEnabled = hmod === PROTOCOL.HEAT;
    }
    const hmax = MessageCodec.extractValue(raw.hmax);
    if (hmax !== undefined) {
      const temperature = parseInt(hmax, 10);
      if (!isNaN(temperature)) {
        state.targetTemperature = temperature;
      }
    }
    const hsta = MessageCodec.extractValue(raw.hsta);
    if (hsta !== undefined) {
      state.heatingActive = hsta === PROTOCOL.ON;
    }
  }

  /**
   * Parse humidifier data from raw state (PH models)
   */
  private static parseHumidifierData(raw: RawStateData, state: Partial<DeviceState>): void {
    const hume = MessageCodec.extractValue(raw.hume);
    if (hume !== undefined) {
      state.humidifierEnabled = hume === PROTOCOL.ON || hume === PROTOCOL.AUTO;
      state.humidifierAuto = hume === PROTOCOL.AUTO;
    }
    const humt = MessageCodec.extractValue(raw.humt);
    if (humt !== undefined) {
      const humidity = parseInt(humt, 10);
      if (!isNaN(humidity)) {
        state.targetHumidity = humidity;
      }
    }
  }

  /**
   * Parse Link series specific fields
   */
  private static parseLinkSeriesData(raw: RawStateData, state: Partial<DeviceState>): void {
    const fnst = MessageCodec.extractValue(raw.fnst);
    if (fnst !== undefined) {
      state.fanState = fnst === PROTOCOL.ON;
    }
    const qtar = MessageCodec.extractValue(raw.qtar);
    if (qtar !== undefined) {
      const value = parseInt(qtar, 10);
      if (!isNaN(value)) {
        state.airQualityTarget = value;
      }
    }
    const ercd = MessageCodec.extractValue(raw.ercd);
    if (ercd !== undefined) {
      state.errorCode = ercd;
    }
    const wacd = MessageCodec.extractValue(raw.wacd);
    if (wacd !== undefined) {
      state.warningCode = wacd;
    }
    const tilt = MessageCodec.extractValue(raw.tilt);
    if (tilt !== undefined) {
      state.tiltStatus = tilt;
    }
  }

  /**
   * Encode fan speed (1-10 or -1 for AUTO) to Dyson format
   */
  static encodeFanSpeed(speed: number): string {
    if (speed < 0) {
      return PROTOCOL.AUTO;
    }
    const clampedSpeed = Math.max(FAN_SPEED.MIN, Math.min(FAN_SPEED.MAX, speed));
    return String(clampedSpeed).padStart(FORMAT.PAD_LENGTH, FORMAT.PAD_CHAR);
  }

  /**
   * Decode fan speed from Dyson format
   */
  static decodeFanSpeed(encoded: string): { speed: number; autoMode: boolean } {
    if (encoded === PROTOCOL.AUTO) {
      return { speed: FAN_SPEED.AUTO, autoMode: true };
    }
    const speed = parseInt(encoded, 10);
    return { speed: isNaN(speed) ? 0 : speed, autoMode: false };
  }

  /**
   * Convert HomeKit percentage (0-100) to Dyson speed (1-10)
   */
  static percentToSpeed(percent: number): number {
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
   */
  static speedToPercent(speed: number): number {
    if (speed < 0) {
      return PERCENT.MIN;
    }
    return Math.max(PERCENT.MIN, Math.min(PERCENT.MAX, speed * PERCENT.PER_SPEED_LEVEL));
  }

  /**
   * Encode temperature from Celsius to Dyson format (Kelvin * 10)
   */
  static encodeTemperature(celsius: number): string {
    const kelvinTimes10 = Math.round(
      (celsius + TEMPERATURE.KELVIN_OFFSET) * TEMPERATURE.KELVIN_MULTIPLIER,
    );
    return String(kelvinTimes10);
  }

  /**
   * Decode temperature from Dyson format to Celsius
   */
  static decodeTemperature(encoded: string | number): number {
    const kelvinTimes10 = typeof encoded === 'string' ? parseInt(encoded, 10) : encoded;
    return (kelvinTimes10 / TEMPERATURE.KELVIN_MULTIPLIER) - TEMPERATURE.KELVIN_OFFSET;
  }

  /**
   * Convert a Dyson temperature reading (Kelvin × 10) to Celsius rounded to
   * 0.1°, or undefined when there is no valid reading.
   */
  static decodeCelsius(kelvinTimes10: number | undefined): number | undefined {
    if (kelvinTimes10 === undefined || !Number.isFinite(kelvinTimes10) || kelvinTimes10 <= 0) {
      return undefined;
    }
    return Math.round(MessageCodec.decodeTemperature(kelvinTimes10) * 10) / 10;
  }
}
