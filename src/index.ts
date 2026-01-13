import type { API } from 'homebridge';

import { DysonPureCoolPlatform } from './platform.js';
import { PLATFORM_NAME } from './settings.js';

/**
 * Registers the Dyson Pure Cool platform with Homebridge.
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, DysonPureCoolPlatform);
};
