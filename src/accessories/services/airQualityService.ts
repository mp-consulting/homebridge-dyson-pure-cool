/**
 * Air Quality Service Handler
 *
 * Implements the HomeKit AirQualitySensor service for Dyson devices.
 * Provides overall air quality level, PM2.5, PM10, and VOC readings.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig, CharacteristicType } from './baseService.js';

/**
 * Configuration for AirQualityService
 */
export interface AirQualityServiceConfig extends BaseServiceConfig<DysonLinkDevice> {
  /** Whether device supports NO2 sensor */
  hasNo2Sensor?: boolean;
  /**
   * Whether device has basic air quality sensor (Link series)
   * Basic sensors use pact/vact index (0-9 scale) instead of PM2.5 µg/m³
   */
  basicAirQualitySensor?: boolean;
}

/** HomeKit AirQuality values */
const AIR_QUALITY = {
  UNKNOWN: 0,
  EXCELLENT: 1,
  GOOD: 2,
  FAIR: 3,
  INFERIOR: 4,
  POOR: 5,
} as const;

/** Upper bounds for EXCELLENT, GOOD, FAIR and INFERIOR; anything above is POOR */
type Thresholds = { EXCELLENT: number; GOOD: number; FAIR: number; INFERIOR: number };

/**
 * HomeKit AirQuality levels based on PM2.5 µg/m³
 *
 * Based on EPA Air Quality Index (AQI) breakpoints:
 * - EXCELLENT (1): PM2.5 0-12 µg/m³ (Good)
 * - GOOD (2): PM2.5 13-35 µg/m³ (Moderate)
 * - FAIR (3): PM2.5 36-55 µg/m³ (Unhealthy for Sensitive Groups)
 * - INFERIOR (4): PM2.5 56-150 µg/m³ (Unhealthy)
 * - POOR (5): PM2.5 151+ µg/m³ (Very Unhealthy/Hazardous)
 */
const PM25_THRESHOLDS = {
  EXCELLENT: 12,
  GOOD: 35,
  FAIR: 55,
  INFERIOR: 150,
};

/**
 * Thresholds for basic sensor pact (particulate) index (0-9 scale)
 * Used by older Link series devices (HP02, TP02)
 */
const PACT_THRESHOLDS = {
  EXCELLENT: 2,
  GOOD: 4,
  FAIR: 7,
  INFERIOR: 9,
};

/**
 * Thresholds for basic sensor vact (VOC) index after scaling
 * Raw vact value is multiplied by VOC_SCALING_FACTOR before comparison
 */
const VACT_THRESHOLDS = {
  EXCELLENT: 3,
  GOOD: 6,
  FAIR: 8,
  INFERIOR: 9,
};

/**
 * Scaling factor to convert raw vact index to comparable scale
 * Raw vact (0-72) * 0.125 = scaled value (0-9)
 */
const VOC_SCALING_FACTOR = 0.125;

/**
 * HomeKit AirQuality levels based on PM10 µg/m³ (EPA AQI breakpoints)
 */
const PM10_THRESHOLDS = {
  EXCELLENT: 54,
  GOOD: 154,
  FAIR: 254,
  INFERIOR: 354,
};

/**
 * Thresholds for advanced sensor VOC / NO2 indices.
 * Dyson reports these as index × 10 (va10, noxl); after dividing by
 * INDEX_DIVISOR the Dyson app scale is 0-3 good, 4-6 fair, 7-8 poor, 9+ very poor.
 */
const INDEX_THRESHOLDS = {
  EXCELLENT: 1,
  GOOD: 3,
  FAIR: 6,
  INFERIOR: 8,
};

/** Divisor converting va10/noxl readings to the Dyson 0-10 index */
const INDEX_DIVISOR = 10;

/**
 * AirQualityService handles the HomeKit AirQualitySensor service
 *
 * Maps Dyson air quality data to HomeKit characteristics:
 * - AirQuality (1-5 scale, the worst of the available pollutant readings)
 * - PM2_5Density (µg/m³, advanced sensors only)
 * - PM10Density (µg/m³, advanced sensors only)
 * - VOCDensity (index value, not actual µg/m³)
 * - NitrogenDioxideDensity (index value, for NO2 models)
 */
export class AirQualityService extends BaseService<DysonLinkDevice> {
  private readonly hasNo2Sensor: boolean;
  private readonly basicAirQualitySensor: boolean;

  constructor(config: AirQualityServiceConfig) {
    super(config, {
      type: config.api.hap.Service.AirQualitySensor,
      name: 'Air Quality',
      subtype: 'air-quality-sensor',
    });
    this.hasNo2Sensor = config.hasNo2Sensor ?? false;
    this.basicAirQualitySensor = config.basicAirQualitySensor ?? false;

    const Characteristic = this.api.hap.Characteristic;

    // Set up AirQuality characteristic (required)
    this.service.getCharacteristic(Characteristic.AirQuality)
      .onGet(this.handleAirQualityGet.bind(this));

    if (this.basicAirQualitySensor) {
      // Basic sensors report a 0-9 particulate index, not densities. Exposing
      // it as PM2.5 µg/m³ (and PM10 as 0) would show misleading numbers, so
      // drop those characteristics, including from cached services.
      this.removeCharacteristicIfPresent(Characteristic.PM2_5Density);
      this.removeCharacteristicIfPresent(Characteristic.PM10Density);
    } else {
      this.service.getCharacteristic(Characteristic.PM2_5Density)
        .onGet(() => this.handleDensityGet(Characteristic.PM2_5Density, 'PM2.5', this.device.getState().pm25));
      this.service.getCharacteristic(Characteristic.PM10Density)
        .onGet(() => this.handleDensityGet(Characteristic.PM10Density, 'PM10', this.device.getState().pm10));
    }

    // Set up VOC Density characteristic
    // Note: HomeKit expects µg/m³ but Dyson provides an index value
    this.service.getCharacteristic(Characteristic.VOCDensity)
      .onGet(() => this.handleDensityGet(Characteristic.VOCDensity, 'VOC index', this.device.getState().vocIndex));

    // Set up NO2 Density characteristic (for NO2 models)
    if (this.hasNo2Sensor) {
      this.service.getCharacteristic(Characteristic.NitrogenDioxideDensity)
        .onGet(() => this.handleDensityGet(
          Characteristic.NitrogenDioxideDensity, 'NO2 index', this.device.getState().no2Index,
        ));
    }

    this.log.debug('AirQualityService initialized for', config.accessory.displayName);
  }

  private removeCharacteristicIfPresent(characteristic: CharacteristicType): void {
    const existing = this.service.characteristics?.find((c) => c.UUID === characteristic.UUID);
    if (existing) {
      this.service.removeCharacteristic(existing);
    }
  }

  /**
   * Calculate HomeKit AirQuality level from sensor data
   *
   * For advanced sensors: the worst of PM2.5, PM10, VOC and NO2
   * For basic sensors (Link): the worse of the pact and vact indices
   *
   * @returns HomeKit AirQuality value (0-5)
   */
  private calculateAirQuality(state: DeviceState): number {
    if (this.basicAirQualitySensor) {
      // Basic sensors (Link series) - pm25 is actually pact index (0-9)
      if (!isValidReading(state.pm25)) {
        return AIR_QUALITY.UNKNOWN;
      }
      const pactQuality = rate(state.pm25, PACT_THRESHOLDS);
      const vactQuality = isValidReading(state.vocIndex)
        ? rate(state.vocIndex * VOC_SCALING_FACTOR, VACT_THRESHOLDS)
        : AIR_QUALITY.EXCELLENT;
      return Math.max(pactQuality, vactQuality);
    }

    const ratings: number[] = [];
    if (isValidReading(state.pm25)) {
      ratings.push(rate(state.pm25, PM25_THRESHOLDS));
    }
    if (isValidReading(state.pm10)) {
      ratings.push(rate(state.pm10, PM10_THRESHOLDS));
    }
    if (isValidReading(state.vocIndex)) {
      ratings.push(rate(state.vocIndex / INDEX_DIVISOR, INDEX_THRESHOLDS));
    }
    if (this.hasNo2Sensor && isValidReading(state.no2Index)) {
      ratings.push(rate(state.no2Index / INDEX_DIVISOR, INDEX_THRESHOLDS));
    }
    return ratings.length > 0 ? Math.max(...ratings) : AIR_QUALITY.UNKNOWN;
  }

  /**
   * Handle AirQuality GET request
   * Returns 0-5 (UNKNOWN to POOR)
   */
  private handleAirQualityGet(): CharacteristicValue {
    this.assertConnected();
    const state = this.device.getState();
    const airQuality = this.calculateAirQuality(state);
    if (this.basicAirQualitySensor) {
      this.log.debug('Get AirQuality ->', airQuality, '(pact:', state.pm25, ', vact:', state.vocIndex, ')');
    } else {
      this.log.debug('Get AirQuality ->', airQuality, '(PM2.5:', state.pm25, 'µg/m³)');
    }
    return airQuality;
  }

  /**
   * Handle a density GET request. Returns the last value HomeKit has while
   * the sensor has no valid reading.
   */
  private handleDensityGet(
    characteristic: CharacteristicType,
    label: string,
    value: number | undefined,
  ): CharacteristicValue {
    this.assertConnected();
    if (!isValidReading(value)) {
      return this.cachedValue(characteristic);
    }
    this.log.debug(`Get ${label} ->`, value);
    return value;
  }

  protected handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    this.update(Characteristic.AirQuality, this.calculateAirQuality(state));

    if (!this.basicAirQualitySensor) {
      if (isValidReading(state.pm25)) {
        this.update(Characteristic.PM2_5Density, state.pm25);
      }
      if (isValidReading(state.pm10)) {
        this.update(Characteristic.PM10Density, state.pm10);
      }
    }

    if (isValidReading(state.vocIndex)) {
      this.update(Characteristic.VOCDensity, state.vocIndex);
    }

    if (this.hasNo2Sensor && isValidReading(state.no2Index)) {
      this.update(Characteristic.NitrogenDioxideDensity, state.no2Index);
    }
  }
}

/**
 * Whether a sensor reading is a usable, non-negative number
 */
function isValidReading(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

/**
 * Map a reading to a HomeKit AirQuality level using upper-bound thresholds
 */
function rate(value: number, thresholds: Thresholds): number {
  if (value <= thresholds.EXCELLENT) {
    return AIR_QUALITY.EXCELLENT;
  }
  if (value <= thresholds.GOOD) {
    return AIR_QUALITY.GOOD;
  }
  if (value <= thresholds.FAIR) {
    return AIR_QUALITY.FAIR;
  }
  if (value <= thresholds.INFERIOR) {
    return AIR_QUALITY.INFERIOR;
  }
  return AIR_QUALITY.POOR;
}
