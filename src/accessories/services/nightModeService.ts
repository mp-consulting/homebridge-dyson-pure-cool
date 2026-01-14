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
 * NightModeService handles the Night Mode Switch HomeKit service
 *
 * Maps HomeKit On characteristic to Dyson night mode (nmod):
 * - On = true ↔ nmod: "ON"
 * - On = false ↔ nmod: "OFF"
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

    // Create a Switch service for night mode
    // Use subtype to distinguish from other switch services
    this.service = config.accessory.getService('Night Mode') ||
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
    const nightMode = value as boolean;
    this.log.debug('Set Night Mode ->', nightMode);

    try {
      await this.device.setNightMode(nightMode);
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
    const Characteristic = this.api.hap.Characteristic;

    this.service.updateCharacteristic(
      Characteristic.On,
      state.nightMode,
    );
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
