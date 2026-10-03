/**
 * Plugin entry point Unit Tests
 */

import { vi, describe, it, expect } from 'vitest';
import type { API } from 'homebridge';

import registerPlugin from '../../src/index.js';
import { DysonPureCoolPlatform } from '../../src/platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from '../../src/config/index.js';

describe('plugin entry point', () => {
  it('registers the platform with Homebridge', () => {
    const api = { registerPlatform: vi.fn() };
    registerPlugin(api as unknown as API);
    expect(api.registerPlatform).toHaveBeenCalledTimes(1);
    expect(api.registerPlatform).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, DysonPureCoolPlatform);
  });
});
