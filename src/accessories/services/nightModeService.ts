/**
 * Night Mode Service Handler
 *
 * Implements a HomeKit Switch service for Dyson night mode.
 * Night mode runs the fan quietly with a dimmed display.
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
 * Configuration for NightModeService
 */
export interface NightModeServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * NightModeService handles the Switch HomeKit service for night mode
 *
 * Maps HomeKit characteristics to Dyson device state:
 * - On (boolean) ↔ nightMode (boolean)
 */
export class NightModeService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;

  constructor(config: NightModeServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Create a Switch service with a unique subtype to distinguish from other switches
    const existingService = config.accessory.getServiceById(Service.Switch, 'night-mode');
    this.service = existingService ||
      config.accessory.addService(Service.Switch, 'Night Mode', 'night-mode');

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      'Night Mode',
    );

    // Set up On characteristic
    this.service.getCharacteristic(Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('NightModeService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle On GET request
   * Returns true if night mode is enabled
   */
  private handleOnGet(): CharacteristicValue {
    const state = this.device.getState();
    this.log.debug('Get Night Mode ->', state.nightMode);
    return state.nightMode;
  }

  /**
   * Handle On SET request
   * @param value - true to enable night mode, false to disable
   */
  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    const enabled = value as boolean;
    this.log.debug('Set Night Mode ->', enabled);

    try {
      await this.device.setNightMode(enabled);
    } catch (error) {
      this.log.error('Failed to set night mode:', error);
      throw error;
    }
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristic to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    this.log.debug('Night mode state changed ->', state.nightMode);

    const Characteristic = this.api.hap.Characteristic;
    this.service.updateCharacteristic(Characteristic.On, state.nightMode);
  }

  /**
   * Update characteristic from current device state
   * Call this after connecting to sync HomeKit with device
   */
  updateFromState(): void {
    const state = this.device.getState();
    this.handleStateChange(state);
  }
}
