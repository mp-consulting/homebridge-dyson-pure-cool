/**
 * Night Mode Service Handler
 *
 * Implements a HomeKit Switch service for Dyson night mode.
 * Night mode runs the fan quietly with a dimmed display.
 */

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import { BooleanSwitchService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for NightModeService
 */
export type NightModeServiceConfig = BaseServiceConfig<DysonLinkDevice>;

/**
 * NightModeService handles a HomeKit Switch for night mode
 */
export class NightModeService extends BooleanSwitchService<DysonLinkDevice> {
  constructor(config: NightModeServiceConfig) {
    super(config, {
      subtype: 'night-mode',
      name: 'Night Mode',
      read: (state) => state.nightMode ?? false,
      write: (device, on) => device.setNightMode(on),
    });
  }
}
