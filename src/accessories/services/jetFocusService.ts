/**
 * Jet Focus Service Handler
 *
 * Implements the HomeKit Switch service for Dyson Jet Focus (front airflow) control.
 * When enabled, air is directed in a focused stream. When disabled, air is diffused.
 */

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import { BooleanSwitchService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for JetFocusService
 */
export type JetFocusServiceConfig = BaseServiceConfig<DysonLinkDevice>;

/**
 * JetFocusService handles a HomeKit Switch for jet focus
 */
export class JetFocusService extends BooleanSwitchService<DysonLinkDevice> {
  constructor(config: JetFocusServiceConfig) {
    super(config, {
      subtype: 'jet-focus',
      name: 'Jet Focus',
      read: (state) => state.frontAirflow ?? false,
      write: (device, on) => device.setJetFocus(on),
    });
  }
}
