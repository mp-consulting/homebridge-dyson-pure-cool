import type { API } from 'homebridge';

import { DysonPureCoolPlatform } from './platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './config/index.js';

/**
 * Registers the Dyson Pure Cool platform with Homebridge.
 */
export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DysonPureCoolPlatform);
};
