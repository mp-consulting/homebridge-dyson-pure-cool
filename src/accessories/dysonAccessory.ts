/**
 * Base Accessory Class for Dyson Devices
 *
 * Abstract class that provides common functionality for all Dyson accessory types.
 * Handles AccessoryInformation setup and device state change subscriptions.
 */

import type {
  API,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { DysonDevice } from '../devices/dysonDevice.js';
import type { DeviceState } from '../devices/types.js';

/**
 * Configuration for DysonAccessory
 */
export interface DysonAccessoryConfig {
  accessory: PlatformAccessory;
  device: DysonDevice;
  api: API;
  log: Logging;
}

/**
 * Abstract base class for all Dyson accessories
 *
 * Provides:
 * - AccessoryInformation service setup
 * - Device reference management
 * - State change subscription
 * - Abstract method for service setup
 */
export abstract class DysonAccessory {
  protected readonly accessory: PlatformAccessory;
  protected readonly device: DysonDevice;
  protected readonly api: API;
  protected readonly log: Logging;

  /**
   * Create a new DysonAccessory
   *
   * @param config - Accessory configuration
   */
  constructor(config: DysonAccessoryConfig) {
    this.accessory = config.accessory;
    this.device = config.device;
    this.api = config.api;
    this.log = config.log;

    // Set up AccessoryInformation service
    this.setupAccessoryInformation();

    // Subscribe to device state changes
    this.device.on('stateChange', this.handleStateChange.bind(this));
    this.device.on('connect', this.handleConnect.bind(this));
    this.device.on('disconnect', this.handleDisconnect.bind(this));
    this.device.on('debug', (message: string) => this.log.debug(message));

    // Set up device-specific services
    this.setupServices();

    this.log.debug('DysonAccessory initialized for', this.accessory.displayName);
  }

  /**
   * Set up device-specific services
   *
   * Must be implemented by subclasses to add the appropriate
   * HomeKit services for the device type.
   */
  protected abstract setupServices(): void;

  /**
   * Handle device state changes
   *
   * Can be overridden by subclasses to update service characteristics.
   *
   * @param state - New device state
   */
  protected handleStateChange(_state: DeviceState): void {
    this.log.debug('Device state changed for', this.accessory.displayName);
    // Subclasses should override to update their services
  }

  /**
   * Handle device connection
   *
   * Called when the device connects. Can be overridden by subclasses.
   */
  protected handleConnect(): void {
    this.log.info('Device connected:', this.accessory.displayName);
  }

  /**
   * Handle device disconnection
   *
   * Called when the device disconnects. Can be overridden by subclasses
   * to mark the accessory as "Not Responding" in HomeKit.
   */
  protected handleDisconnect(): void {
    this.log.warn('Device disconnected:', this.accessory.displayName);
  }

  /**
   * Get the HomeKit accessory
   */
  getAccessory(): PlatformAccessory {
    return this.accessory;
  }

  /**
   * Get the Dyson device
   */
  getDevice(): DysonDevice {
    return this.device;
  }

  /**
   * Set up the AccessoryInformation service
   *
   * Sets manufacturer, model, serial number, and firmware version.
   */
  private setupAccessoryInformation(): void {
    const Characteristic = this.api.hap.Characteristic;

    const informationService = this.accessory.getService(this.api.hap.Service.AccessoryInformation);

    if (informationService) {
      informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Dyson')
        .setCharacteristic(Characteristic.Model, this.getModelName())
        .setCharacteristic(Characteristic.SerialNumber, this.device.getSerial())
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0');
    }
  }

  /**
   * Get the model name for the device
   *
   * Returns a human-readable model name based on product type.
   */
  private getModelName(): string {
    const productType = this.device.productType;

    const modelNames: Record<string, string> = {
      '455': 'Pure Hot+Cool Link (HP02)',
      '438': 'Pure Cool Tower (TP04)',
      '438E': 'Purifier Cool (TP07)',
      '469': 'Pure Cool Link Desk (DP01)',
      '475': 'Pure Cool Link Tower (TP02)',
      '520': 'Pure Cool Desk (DP04)',
      '527': 'Pure Hot+Cool (HP04)',
      '527E': 'Purifier Hot+Cool (HP07)',
      '358': 'Pure Humidify+Cool (PH01)',
      '358E': 'Pure Humidify+Cool (PH03)',
    };

    return modelNames[productType] || `Dyson (${productType})`;
  }

  /**
   * Remove a service from the accessory if it exists
   *
   * Useful for cleanup when reconfiguring accessories.
   *
   * @param service - The service instance to remove
   */
  protected removeService(service: Service): void {
    this.accessory.removeService(service);
  }
}
