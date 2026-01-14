/**
 * Continuous Monitoring Service Handler
 *
 * Implements a HomeKit Switch service for Dyson continuous monitoring.
 * When enabled, sensors remain active even when the fan is off.
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
 * Configuration for ContinuousMonitoringService
 */
export interface ContinuousMonitoringServiceConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * ContinuousMonitoringService handles the Continuous Monitoring Switch HomeKit service
 *
 * Maps HomeKit On characteristic to Dyson continuous monitoring (rhtm):
 * - On = true ↔ rhtm: "ON"
 * - On = false ↔ rhtm: "OFF"
 */
export class ContinuousMonitoringService {
  private readonly service: Service;
  private readonly device: DysonLinkDevice;
  private readonly log: Logging;
  private readonly api: API;

  constructor(config: ContinuousMonitoringServiceConfig) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Create a Switch service for continuous monitoring
    // Use subtype to distinguish from other switch services
    this.service = config.accessory.getService('Continuous Monitoring') ||
      config.accessory.addService(Service.Switch, 'Continuous Monitoring', 'continuous-monitoring');

    // Set display name
    this.service.setCharacteristic(
      Characteristic.Name,
      'Continuous Monitoring',
    );

    // Set up On characteristic
    this.service.getCharacteristic(Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));

    this.log.debug('ContinuousMonitoringService initialized for', config.accessory.displayName);
  }

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Handle On GET request
   * Returns true if continuous monitoring is enabled
   */
  private handleOnGet(): CharacteristicValue {
    const state = this.device.getState();
    // Default to true if undefined (most users want sensors active)
    const enabled = state.continuousMonitoring ?? true;
    this.log.debug('Get Continuous Monitoring ->', enabled);
    return enabled;
  }

  /**
   * Handle On SET request
   * @param value - true to enable continuous monitoring, false to disable
   */
  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    const enabled = value as boolean;
    this.log.debug('Set Continuous Monitoring ->', enabled);

    try {
      await this.device.setContinuousMonitoring(enabled);
    } catch (error) {
      this.log.error('Failed to set continuous monitoring:', error);
      throw error;
    }
  }

  /**
   * Handle device state changes
   * Updates HomeKit characteristic to reflect current device state
   */
  private handleStateChange(state: DeviceState): void {
    const Characteristic = this.api.hap.Characteristic;

    // Default to true if undefined
    const enabled = state.continuousMonitoring ?? true;

    this.service.updateCharacteristic(
      Characteristic.On,
      enabled,
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
