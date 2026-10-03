/**
 * Continuous Monitoring Service Handler
 *
 * Implements a HomeKit Switch service for Dyson continuous monitoring.
 * When enabled, sensors remain active even when the fan is off.
 */

import type { DysonLinkDevice } from '../../devices/dysonLinkDevice.js';
import { BooleanSwitchService } from './baseService.js';
import type { BaseServiceConfig } from './baseService.js';

/**
 * Configuration for ContinuousMonitoringService
 */
export type ContinuousMonitoringServiceConfig = BaseServiceConfig<DysonLinkDevice>;

/**
 * ContinuousMonitoringService handles a HomeKit Switch for continuous monitoring
 */
export class ContinuousMonitoringService extends BooleanSwitchService<DysonLinkDevice> {
  constructor(config: ContinuousMonitoringServiceConfig) {
    super(config, {
      subtype: 'continuous-monitoring',
      name: 'Continuous Monitoring',
      read: (state) => state.continuousMonitoring ?? true,
      write: (device, on) => device.setContinuousMonitoring(on),
    });
  }
}
