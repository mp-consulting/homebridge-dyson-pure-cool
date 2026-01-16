/**
 * Jet Focus Service Handler
 *
 * Implements the HomeKit Switch service for Dyson Jet Focus (front airflow) control.
 * When enabled, air is directed in a focused stream. When disabled, air is diffused.
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
 * Configuration for JetFocusService
 */
export interface JetFocusServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * JetFocusService handles a HomeKit Switch for Jet Focus mode
 *
 * Maps HomeKit On characteristic to Dyson frontAirflow state
 */
export class JetFocusService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;

  constructor(config: JetFocusServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Create Switch service with unique subtype for Jet Focus
    const existingService = config.accessory.getServiceById(Service.Switch, 'jet-focus');
    this.service = existingService ||
      config.accessory.addService(Service.Switch, 'Jet Focus', 'jet-focus');

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      'Jet Focus',
    );

    // Set up On characteristic
    this.service.getCharacteristic(Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('JetFocusService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle On GET request
   */
  private handleOnGet(): CharacteristicValue {
    const state = this.device.getState();
    const isOn = state.frontAirflow ?? false;
    this.log.debug('Get Jet Focus ->', isOn);
    return isOn;
  }

  /**
   * Handle On SET request
   */
  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    const on = value as boolean;
    this.log.debug('Set Jet Focus ->', on);

    try {
      await this.device.setJetFocus(on);
    } catch (error) {
      this.log.error('Failed to set jet focus:', error);
      throw error;
    }
  }

  /**
   * Handle device state changes
   */
  private handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;
    const isOn = state.frontAirflow ?? false;
    this.service.updateCharacteristic(Characteristic.On, isOn);
  }

  /**
   * Update characteristic from current device state
   */
  updateFromState(): void {
    const state = this.device.getState();
    this.handleStateChange(state);
  }
}
