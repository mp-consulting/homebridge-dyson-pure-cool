/**
 * Dyson Link Accessory
 *
 * HomeKit accessory handler for Dyson Link series devices.
 * Supports HP02 (455), TP04 (438), and TP07 (438E).
 */

import type {
  API,
  Logging,
  PlatformAccessory,
} from 'homebridge';

import { DysonAccessory } from './dysonAccessory.js';
import type { DysonAccessoryConfig } from './dysonAccessory.js';
import { FanService } from './services/fanService.js';
import type { DysonLinkDevice } from '../devices/dysonLinkDevice.js';
import type { DeviceState } from '../devices/types.js';

/**
 * Configuration for DysonLinkAccessory
 */
export interface DysonLinkAccessoryConfig {
  accessory: PlatformAccessory;
  device: DysonLinkDevice;
  api: API;
  log: Logging;
}

/**
 * DysonLinkAccessory handles HomeKit integration for Link series devices
 *
 * Features:
 * - Fan control (power, speed, oscillation)
 * - Future: Temperature/humidity sensors (E4)
 * - Future: Air quality sensors (E6)
 */
export class DysonLinkAccessory extends DysonAccessory {
  private fanService!: FanService;

  /**
   * Create a new DysonLinkAccessory
   *
   * @param config - Accessory configuration
   */
  constructor(config: DysonLinkAccessoryConfig) {
    // Pass to parent - the base class will call setupServices()
    super(config as DysonAccessoryConfig);
  }

  /**
   * Set up device-specific services
   *
   * Creates the FanService for fan control functionality.
   */
  protected setupServices(): void {
    // Create FanService for fan control
    this.fanService = new FanService({
      accessory: this.accessory,
      device: this.device as DysonLinkDevice,
      api: this.api,
      log: this.log,
    });

    this.log.debug('DysonLinkAccessory services configured');
  }

  /**
   * Handle device state changes
   *
   * FanService handles its own state updates via event subscription,
   * but we can add additional handling here if needed.
   *
   * @param state - New device state
   */
  protected handleStateChange(state: DeviceState): void {
    super.handleStateChange(state);
    // FanService subscribes to stateChange directly, so no need to forward
  }

  /**
   * Handle device disconnection
   *
   * When device disconnects, HomeKit will show "Not Responding"
   * automatically when characteristic gets return errors.
   */
  protected handleDisconnect(): void {
    super.handleDisconnect();
    this.log.warn('DysonLinkAccessory: Device disconnected, HomeKit will show Not Responding');
  }

  /**
   * Handle device connection
   *
   * When device reconnects, sync HomeKit state with device.
   */
  protected handleConnect(): void {
    super.handleConnect();
    // Sync HomeKit state with device state after reconnection
    this.fanService.updateFromState();
    this.log.info('DysonLinkAccessory: Device reconnected, state synced');
  }

  /**
   * Get the FanService instance
   */
  getFanService(): FanService {
    return this.fanService;
  }
}
