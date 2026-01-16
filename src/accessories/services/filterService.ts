/**
 * Filter Service Handler
 *
 * Implements the HomeKit FilterMaintenance service for Dyson devices.
 * Provides filter life percentage and change indication for HEPA and carbon filters.
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
 * Configuration for FilterService
 */
export interface FilterServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * Maximum filter life in hours (approximately 1 year of continuous use)
 * Used to convert hours to percentage
 */
const MAX_FILTER_LIFE_HOURS = 4300;

/**
 * Threshold percentage below which filter change is indicated
 */
const FILTER_CHANGE_THRESHOLD = 10;

/**
 * FilterService handles the HomeKit FilterMaintenance service
 *
 * Maps Dyson filter data to HomeKit characteristics:
 * - FilterLifeLevel (0-100% based on HEPA filter)
 * - FilterChangeIndication (1 when filter life <= 10%)
 */
export class FilterService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;

  constructor(config: FilterServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Get or create the FilterMaintenance service
    this.service = config.accessory.getService(Service.FilterMaintenance) ||
      config.accessory.addService(Service.FilterMaintenance);

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      'Filter',
    );

    // Set up FilterLifeLevel characteristic (required)
    this.service.getCharacteristic(Characteristic.FilterLifeLevel)
      .onGet(this.handleFilterLifeLevelGet.bind(this));

    // Set up FilterChangeIndication characteristic (required)
    this.service.getCharacteristic(Characteristic.FilterChangeIndication)
      .onGet(this.handleFilterChangeIndicationGet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('FilterService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Calculate filter life percentage from hours remaining
   *
   * @param hoursRemaining - Hours of filter life remaining
   * @returns Percentage (0-100)
   */
  private calculateFilterLifePercent(hoursRemaining: number | undefined): number {
    if (hoursRemaining === undefined || hoursRemaining < 0) {
      return 100; // Assume full if unknown
    }

    const percent = Math.round((hoursRemaining / MAX_FILTER_LIFE_HOURS) * 100);
    return Math.min(100, Math.max(0, percent));
  }

  /**
   * Get the primary filter life (HEPA filter, with carbon as fallback)
   */
  private getPrimaryFilterLife(): number | undefined {
    const state = this.device.getState();
    return state.hepaFilterLife ?? state.carbonFilterLife;
  }

  /**
   * Handle FilterLifeLevel GET request
   * Returns 0-100 percentage
   */
  private handleFilterLifeLevelGet(): CharacteristicValue {
    const filterLife = this.getPrimaryFilterLife();
    const percent = this.calculateFilterLifePercent(filterLife);
    this.log.debug('Get FilterLifeLevel ->', percent, '% (', filterLife, 'hours)');
    return percent;
  }

  /**
   * Handle FilterChangeIndication GET request
   * Returns 1 if filter needs changing, 0 otherwise
   */
  private handleFilterChangeIndicationGet(): CharacteristicValue {
    const filterLife = this.getPrimaryFilterLife();
    const percent = this.calculateFilterLifePercent(filterLife);
    const needsChange = percent <= FILTER_CHANGE_THRESHOLD ? 1 : 0;
    this.log.debug('Get FilterChangeIndication ->', needsChange, '(', percent, '%)');
    return needsChange;
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristics to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    const filterLife = state.hepaFilterLife ?? state.carbonFilterLife;
    const percent = this.calculateFilterLifePercent(filterLife);
    const needsChange = percent <= FILTER_CHANGE_THRESHOLD ? 1 : 0;

    // Update FilterLifeLevel
    this.service.updateCharacteristic(Characteristic.FilterLifeLevel, percent);

    // Update FilterChangeIndication
    this.service.updateCharacteristic(Characteristic.FilterChangeIndication, needsChange);
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
