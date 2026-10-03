/**
 * Filter Service Handler
 *
 * Implements the HomeKit FilterMaintenance service for Dyson devices.
 * Provides filter life percentage and change indication for HEPA and carbon filters.
 */

import type { CharacteristicValue } from 'homebridge';

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import type { DeviceState } from '../../devices/types.js';
import { BaseService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for FilterService
 */
export type FilterServiceConfig = BaseServiceConfig<DysonLinkDevice>;

/**
 * Threshold percentage below which filter change is indicated
 */
const FILTER_CHANGE_THRESHOLD = 10;

/**
 * FilterService handles the HomeKit FilterMaintenance service
 *
 * Maps Dyson filter data to HomeKit characteristics:
 * - FilterLifeLevel (0-100%, the most worn of the HEPA and carbon filters)
 * - FilterChangeIndication (1 when filter life <= 10%)
 */
export class FilterService extends BaseService<DysonLinkDevice> {
  constructor(config: FilterServiceConfig) {
    super(config, {
      type: config.api.hap.Service.FilterMaintenance,
      name: 'Filter',
      subtype: 'filter-maintenance',
    });

    const Characteristic = this.api.hap.Characteristic;

    // Set up FilterLifeLevel characteristic (required)
    this.service.getCharacteristic(Characteristic.FilterLifeLevel)
      .onGet(this.handleFilterLifeLevelGet.bind(this));

    // Set up FilterChangeIndication characteristic (required)
    this.service.getCharacteristic(Characteristic.FilterChangeIndication)
      .onGet(this.handleFilterChangeIndicationGet.bind(this));

    this.log.debug('FilterService initialized for', config.accessory.displayName);
  }

  /**
   * Remaining life of the most worn filter, in percent, or undefined when
   * the device hasn't reported a valid value for either filter.
   */
  private getFilterLifePercent(state: DeviceState): number | undefined {
    const values = [state.hepaFilterLife, state.carbonFilterLife]
      .filter((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0);
    if (values.length === 0) {
      return undefined;
    }
    return Math.min(100, Math.round(Math.min(...values)));
  }

  /**
   * Handle FilterLifeLevel GET request
   * Returns 0-100 percentage
   */
  private handleFilterLifeLevelGet(): CharacteristicValue {
    this.assertConnected();
    const percent = this.getFilterLifePercent(this.device.getState());
    if (percent === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.FilterLifeLevel);
    }
    this.log.debug('Get FilterLifeLevel ->', percent, '%');
    return percent;
  }

  /**
   * Handle FilterChangeIndication GET request
   * Returns 1 if filter needs changing, 0 otherwise
   */
  private handleFilterChangeIndicationGet(): CharacteristicValue {
    this.assertConnected();
    const percent = this.getFilterLifePercent(this.device.getState());
    if (percent === undefined) {
      return this.cachedValue(this.api.hap.Characteristic.FilterChangeIndication);
    }
    const needsChange = percent <= FILTER_CHANGE_THRESHOLD ? 1 : 0;
    this.log.debug('Get FilterChangeIndication ->', needsChange, '(', percent, '%)');
    return needsChange;
  }

  protected handleStateChange(state: DeviceState): void {
    const percent = this.getFilterLifePercent(state);
    if (percent === undefined) {
      return;
    }
    const Characteristic = this.api.hap.Characteristic;
    this.update(Characteristic.FilterLifeLevel, percent);
    this.update(Characteristic.FilterChangeIndication, percent <= FILTER_CHANGE_THRESHOLD ? 1 : 0);
  }
}
