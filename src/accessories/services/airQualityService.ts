/**
 * Air Quality Service Handler
 *
 * Implements the HomeKit AirQualitySensor service for Dyson devices.
 * Provides overall air quality level, PM2.5, PM10, and VOC readings.
 */

import type {
  API,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';

/**
 * Configuration for AirQualityService
 */
export interface AirQualityServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
  /** Whether device supports NO2 sensor */
  hasNo2Sensor?: boolean;
}

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
 * AirQualityService handles the HomeKit AirQualitySensor service
 *
 * Maps Dyson air quality data to HomeKit characteristics:
 * - AirQuality (1-5 scale calculated from PM2.5)
 * - PM2_5Density (µg/m³)
 * - PM10Density (µg/m³)
 * - VOCDensity (index value, not actual µg/m³)
 * - NitrogenDioxideDensity (index value, for Formaldehyde models)
 */
export class AirQualityService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;
  private readonly hasNo2Sensor: boolean;

  constructor(config: AirQualityServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;
    this.hasNo2Sensor = config.hasNo2Sensor ?? false;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the AirQualitySensor service
    this.service = config.accessory.getService(Service.AirQualitySensor) ||
      config.accessory.addService(Service.AirQualitySensor);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      `${config.accessory.displayName} Air Quality`,
    );

    // Set up AirQuality characteristic (required)
    this.service.getCharacteristic(Characteristic.AirQuality)
      .onGet(this.handleAirQualityGet.bind(this));

    // Set up PM2.5 Density characteristic
    this.service.getCharacteristic(Characteristic.PM2_5Density)
      .onGet(this.handlePM25Get.bind(this));

    // Set up PM10 Density characteristic
    this.service.getCharacteristic(Characteristic.PM10Density)
      .onGet(this.handlePM10Get.bind(this));

    // Set up VOC Density characteristic
    // Note: HomeKit expects µg/m³ but Dyson provides an index value
    this.service.getCharacteristic(Characteristic.VOCDensity)
      .onGet(this.handleVOCGet.bind(this));

    // Set up NO2 Density characteristic (for Formaldehyde models)
    if (this.hasNo2Sensor) {
      this.service.getCharacteristic(Characteristic.NitrogenDioxideDensity)
        .onGet(this.handleNO2Get.bind(this));
    }

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('AirQualityService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Calculate HomeKit AirQuality level from PM2.5
   *
   * @param pm25 - PM2.5 value in µg/m³
   * @returns HomeKit AirQuality value (0-5)
   */
  private calculateAirQuality(pm25: number | undefined): number {
    // 0 = UNKNOWN
    if (pm25 === undefined || pm25 < 0) {
      return 0;
    }

    // Map PM2.5 to HomeKit AirQuality levels
    if (pm25 <= PM25_THRESHOLDS.EXCELLENT) {
      return 1; // EXCELLENT
    } else if (pm25 <= PM25_THRESHOLDS.GOOD) {
      return 2; // GOOD
    } else if (pm25 <= PM25_THRESHOLDS.FAIR) {
      return 3; // FAIR
    } else if (pm25 <= PM25_THRESHOLDS.INFERIOR) {
      return 4; // INFERIOR
    } else {
      return 5; // POOR
    }
  }

  /**
   * Handle AirQuality GET request
   * Returns 0-5 (UNKNOWN to POOR)
   */
  private handleAirQualityGet(): CharacteristicValue {
    const state = this.device.getState();
    const airQuality = this.calculateAirQuality(state.pm25);
    this.log.debug('Get AirQuality ->', airQuality, '(PM2.5:', state.pm25, ')');
    return airQuality;
  }

  /**
   * Handle PM2.5 Density GET request
   * Returns µg/m³
   */
  private handlePM25Get(): CharacteristicValue {
    const state = this.device.getState();
    const pm25 = state.pm25 ?? 0;
    this.log.debug('Get PM2.5 Density ->', pm25, 'µg/m³');
    return pm25;
  }

  /**
   * Handle PM10 Density GET request
   * Returns µg/m³
   */
  private handlePM10Get(): CharacteristicValue {
    const state = this.device.getState();
    const pm10 = state.pm10 ?? 0;
    this.log.debug('Get PM10 Density ->', pm10, 'µg/m³');
    return pm10;
  }

  /**
   * Handle VOC Density GET request
   * Note: Dyson provides an index value, not actual µg/m³
   */
  private handleVOCGet(): CharacteristicValue {
    const state = this.device.getState();
    const voc = state.vocIndex ?? 0;
    this.log.debug('Get VOC Index ->', voc);
    return voc;
  }

  /**
   * Handle NO2 Density GET request
   * Note: Dyson provides an index value, not actual µg/m³
   */
  private handleNO2Get(): CharacteristicValue {
    const state = this.device.getState();
    const no2 = state.no2Index ?? 0;
    this.log.debug('Get NO2 Index ->', no2);
    return no2;
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristics to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    // Update AirQuality
    const airQuality = this.calculateAirQuality(state.pm25);
    this.service.updateCharacteristic(Characteristic.AirQuality, airQuality);

    // Update PM2.5
    this.service.updateCharacteristic(
      Characteristic.PM2_5Density,
      state.pm25 ?? 0,
    );

    // Update PM10
    this.service.updateCharacteristic(
      Characteristic.PM10Density,
      state.pm10 ?? 0,
    );

    // Update VOC
    this.service.updateCharacteristic(
      Characteristic.VOCDensity,
      state.vocIndex ?? 0,
    );

    // Update NO2 (if sensor present)
    if (this.hasNo2Sensor) {
      this.service.updateCharacteristic(
        Characteristic.NitrogenDioxideDensity,
        state.no2Index ?? 0,
      );
    }
  }

  /**
   * Update characteristics from current device state
   * Call this after connecting to sync HomeKit with device
   */
  updateFromState(): void {
    const state = this.device.getState();
    this.handleStateChange(state);
  }
}
