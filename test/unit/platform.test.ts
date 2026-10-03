/**
 * DysonPureCoolPlatform Unit Tests
 */

import { EventEmitter } from 'events';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { API, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';

import { DysonPureCoolPlatform } from '../../src/platform.js';
import { createDevice } from '../../src/devices/deviceFactory.js';
import { DysonLinkAccessory } from '../../src/accessories/dysonLinkAccessory.js';
import { MdnsDiscovery } from '../../src/discovery/index.js';
import { PLATFORM_NAME, PLUGIN_NAME } from '../../src/config/index.js';
import type * as DiscoveryModule from '../../src/discovery/index.js';
import { createMockLog } from '../helpers/mocks.js';

vi.mock('../../src/devices/deviceFactory.js', () => ({
  createDevice: vi.fn(),
}));

vi.mock('../../src/accessories/dysonLinkAccessory.js', () => ({
  DysonLinkAccessory: vi.fn(),
}));

vi.mock('../../src/discovery/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DiscoveryModule>();
  return { ...actual, MdnsDiscovery: vi.fn() };
});

class FakeDevice extends EventEmitter {
  connect = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn().mockResolvedValue(undefined);
  setIpAddress = vi.fn();
  setPollingInterval = vi.fn();
  getActiveVariant = vi.fn(() => null);
  constructor(public readonly serial: string, public readonly ipAddress?: string) {
    super();
  }
  getSerial() {
    return this.serial;
  }
}

class FakePlatformAccessory {
  context: Record<string, unknown> = {};
  services: unknown[] = [];
  infoService = { setCharacteristic: vi.fn() };
  getService = vi.fn(() => this.infoService);
  constructor(public displayName: string, public UUID: string) {}
}

const Service = { AccessoryInformation: 'AccessoryInformation' };
const Characteristic = { Name: 'Name' };

function createApi() {
  const handlers = new Map<string, () => Promise<void>>();
  const api = {
    hap: {
      Service,
      Characteristic,
      uuid: { generate: vi.fn((s: string) => `uuid-${s}`) },
    },
    on: vi.fn((event: string, cb: () => Promise<void>) => {
      handlers.set(event, cb);
    }),
    platformAccessory: FakePlatformAccessory,
    registerPlatformAccessories: vi.fn(),
    updatePlatformAccessories: vi.fn(),
    unregisterPlatformAccessories: vi.fn(),
    registerPlatform: vi.fn(),
  };
  return { api, handlers };
}

function device(serial: string, extra: Record<string, unknown> = {}) {
  return {
    serial,
    productType: '438',
    credentials: 'secret',
    ipAddress: '192.168.1.10',
    ...extra,
  };
}

async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe('DysonPureCoolPlatform', () => {
  let devices: FakeDevice[];
  let discover: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    devices = [];
    vi.mocked(createDevice).mockReset();
    vi.mocked(createDevice).mockImplementation((info) => {
      const d = new FakeDevice(info.serial, info.ipAddress);
      devices.push(d);
      return d as never;
    });
    vi.mocked(DysonLinkAccessory).mockReset();
    discover = vi.fn().mockResolvedValue(new Map<string, string>());
    vi.mocked(MdnsDiscovery).mockReset();
    vi.mocked(MdnsDiscovery).mockImplementation(function (this: unknown) {
      return { discover } as unknown as MdnsDiscovery;
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function build(config: Record<string, unknown>) {
    const { api, handlers } = createApi();
    const log = createMockLog();
    const platform = new DysonPureCoolPlatform(
      log as unknown as Logging,
      { platform: PLATFORM_NAME, ...config } as PlatformConfig,
      api as unknown as API,
    );
    return { api, handlers, log, platform };
  }

  function cached(serial: string, displayName: string, context: Record<string, unknown> = {}) {
    const acc = new FakePlatformAccessory(displayName, `uuid-${serial}`);
    acc.context = { ...context };
    return acc;
  }

  it('exposes hap Service and Characteristic and registers lifecycle handlers', () => {
    const { platform, handlers } = build({});
    expect(platform.Service).toBe(Service);
    expect(platform.Characteristic).toBe(Characteristic);
    expect(handlers.has('didFinishLaunching')).toBe(true);
    expect(handlers.has('shutdown')).toBe(true);
  });

  it('warns and does nothing when no devices are configured', async () => {
    const { platform, log, api } = build({});
    await platform.discoverDevices();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('No devices configured'));
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
  });

  it('registers a new accessory on didFinishLaunching', async () => {
    const { api, handlers, platform } = build({ devices: [device('AAA', { name: 'Bedroom' })] });
    await handlers.get('didFinishLaunching')!();

    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    const [plugin, platformName, accessories] = api.registerPlatformAccessories.mock.calls[0];
    expect(plugin).toBe(PLUGIN_NAME);
    expect(platformName).toBe(PLATFORM_NAME);
    expect(accessories).toHaveLength(1);
    const acc = accessories[0] as FakePlatformAccessory;
    expect(acc.displayName).toBe('Bedroom');
    expect(acc.UUID).toBe('uuid-AAA');
    expect(acc.context.device).toMatchObject({ serial: 'AAA', name: 'Bedroom' });
    expect(platform.accessories.get('uuid-AAA')).toBe(acc);
    expect(platform.discoveredCacheUUIDs).toEqual(['uuid-AAA']);
    expect(createDevice).toHaveBeenCalledTimes(1);
  });

  it('uses "Dyson <serial>" as display name when no name is configured', async () => {
    const { api, platform } = build({ devices: [device('AAA')] });
    await platform.discoverDevices();
    expect((api.registerPlatformAccessories.mock.calls[0][2][0] as FakePlatformAccessory).displayName).toBe('Dyson AAA');
  });

  it('skips entries without a serial number with log.error', async () => {
    const { api, log, platform } = build({
      devices: [null, { productType: '438' }, { serial: 42 }, { serial: '' }, device('AAA')],
    });
    await expect(platform.discoverDevices()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith('Skipping device configuration without a serial number');
    expect(log.error).toHaveBeenCalledTimes(4);
    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
  });

  it('catches errors thrown from discoverDevices in didFinishLaunching', async () => {
    const { api, handlers, log } = build({ devices: [device('AAA')] });
    api.registerPlatformAccessories.mockImplementation(() => {
      throw new Error('register failed');
    });
    await expect(handlers.get('didFinishLaunching')!()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith('Failed to set up devices:', expect.any(Error));
  });

  describe('global options', () => {
    it('merges global options without overriding per-device values', async () => {
      const raw = device('AAA', { isNightModeEnabled: false, isTemperatureIgnored: false });
      const { api, platform } = build({
        devices: [raw],
        enableNightMode: true,
        enableJetFocus: true,
        enableContinuousMonitoring: false,
        enableTemperature: false,
        enableHumidity: false,
        enableAirQuality: true,
        enableHeater: false,
        enableFilterStatus: true,
        enableHumidifier: false,
      });
      await platform.discoverDevices();

      const ctx = (api.registerPlatformAccessories.mock.calls[0][2][0] as FakePlatformAccessory).context.device;
      expect(ctx).toMatchObject({
        isNightModeEnabled: false, // per-device wins
        isTemperatureIgnored: false, // per-device wins
        isJetFocusEnabled: true,
        isContinuousMonitoringEnabled: false,
        isHumidityIgnored: true,
        isAirQualityIgnored: false,
        isHeatingDisabled: true,
        isFilterStatusDisabled: false,
        isHumidifierDisabled: true,
      });
      // the original config object is not mutated
      expect(raw).not.toHaveProperty('isJetFocusEnabled');
    });

    it('leaves options undefined when no global value is set', async () => {
      const { api, platform } = build({ devices: [device('AAA')] });
      await platform.discoverDevices();
      const ctx = (api.registerPlatformAccessories.mock.calls[0][2][0] as FakePlatformAccessory)
        .context.device as Record<string, unknown>;
      expect(ctx.isNightModeEnabled).toBeUndefined();
      expect(ctx.isHeatingDisabled).toBeUndefined();
    });
  });

  describe('cached accessories', () => {
    it('restores a cached accessory, updates its name and context', async () => {
      const { api, log, platform } = build({ devices: [device('AAA', { name: 'New Name' })] });
      const acc = cached('AAA', 'Old Name');
      platform.configureAccessory(acc as unknown as PlatformAccessory);
      expect(log.info).toHaveBeenCalledWith('Loading accessory from cache:', 'Old Name');

      await platform.discoverDevices();

      expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(acc.displayName).toBe('New Name');
      expect(acc.getService).toHaveBeenCalledWith(Service.AccessoryInformation);
      expect(acc.infoService.setCharacteristic).toHaveBeenCalledWith(Characteristic.Name, 'New Name');
      expect(acc.context.device).toMatchObject({ serial: 'AAA', name: 'New Name' });
      expect(api.updatePlatformAccessories).toHaveBeenCalledWith([acc]);
      expect(createDevice).toHaveBeenCalledTimes(1);
      expect(vi.mocked(DysonLinkAccessory).mock.calls[0][0].accessory).toBe(acc);
    });

    it('does not touch the name when unchanged', async () => {
      const { api, platform } = build({ devices: [device('AAA', { name: 'Same' })] });
      const acc = cached('AAA', 'Same');
      platform.configureAccessory(acc as unknown as PlatformAccessory);
      await platform.discoverDevices();
      expect(acc.infoService.setCharacteristic).not.toHaveBeenCalled();
      expect(api.updatePlatformAccessories).toHaveBeenCalledWith([acc]);
    });

    it('unregisters cached accessories no longer in config', async () => {
      const { api, platform } = build({ devices: [device('AAA')] });
      const keep = cached('AAA', 'Dyson AAA');
      const stale = cached('ZZZ', 'Old device');
      platform.configureAccessory(keep as unknown as PlatformAccessory);
      platform.configureAccessory(stale as unknown as PlatformAccessory);

      await platform.discoverDevices();

      expect(api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1);
      expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [stale]);
      expect(platform.accessories.has('uuid-ZZZ')).toBe(false);
      expect(platform.accessories.has('uuid-AAA')).toBe(true);
    });

    it('applies a stored ipOverride when the configured IP equals "from"', async () => {
      const { platform } = build({ devices: [device('AAA', { ipAddress: '192.168.1.10' })] });
      const override = { from: '192.168.1.10', to: '192.168.1.99' };
      const acc = cached('AAA', 'Dyson AAA', { ipOverride: override });
      platform.configureAccessory(acc as unknown as PlatformAccessory);

      await platform.discoverDevices();

      expect(acc.context.ipOverride).toEqual(override);
      expect((acc.context.device as Record<string, unknown>).ipAddress).toBe('192.168.1.99');
      expect(createDevice).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: '192.168.1.99' }));
    });

    it('drops a stored ipOverride when the configured IP changed', async () => {
      const { platform } = build({ devices: [device('AAA', { ipAddress: '192.168.1.20' })] });
      const acc = cached('AAA', 'Dyson AAA', { ipOverride: { from: '192.168.1.10', to: '192.168.1.99' } });
      platform.configureAccessory(acc as unknown as PlatformAccessory);

      await platform.discoverDevices();

      expect(acc.context.ipOverride).toBeUndefined();
      expect((acc.context.device as Record<string, unknown>).ipAddress).toBe('192.168.1.20');
      expect(createDevice).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: '192.168.1.20' }));
    });
  });

  describe('mDNS discovery', () => {
    it('injects discovered IPs for devices without one', async () => {
      discover.mockResolvedValue(new Map([['AAA', '192.168.1.55']]));
      const { api, platform } = build({
        devices: [device('AAA', { ipAddress: undefined }), device('BBB')],
        discoveryTimeout: 1234,
      });
      await platform.discoverDevices();

      expect(MdnsDiscovery).toHaveBeenCalledTimes(1);
      expect(discover).toHaveBeenCalledWith({ timeout: 1234 });
      const ctxA = (api.registerPlatformAccessories.mock.calls[0][2][0] as FakePlatformAccessory).context.device;
      const ctxB = (api.registerPlatformAccessories.mock.calls[1][2][0] as FakePlatformAccessory).context.device;
      expect(ctxA).toMatchObject({ ipAddress: '192.168.1.55' });
      expect(ctxB).toMatchObject({ ipAddress: '192.168.1.10' });
    });

    it('does not run mDNS when all devices have an IP', async () => {
      const { platform } = build({ devices: [device('AAA')] });
      await platform.discoverDevices();
      expect(MdnsDiscovery).not.toHaveBeenCalled();
    });

    it('continues when mDNS discovery fails', async () => {
      discover.mockRejectedValue(new Error('no socket'));
      const { api, log, platform } = build({ devices: [device('AAA', { ipAddress: undefined })] });
      await platform.discoverDevices();
      expect(log.warn).toHaveBeenCalledWith('mDNS discovery failed:', expect.any(Error));
      expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('shares one scan between concurrent discoverDeviceIps() calls', async () => {
      let resolveScan!: (m: Map<string, string>) => void;
      discover.mockImplementation(() => new Promise((r) => {
        resolveScan = r;
      }));
      const { platform } = build({});

      const p1 = platform.discoverDeviceIps();
      const p2 = platform.discoverDeviceIps();
      expect(p1).toBe(p2);
      expect(MdnsDiscovery).toHaveBeenCalledTimes(1);
      expect(discover).toHaveBeenCalledTimes(1);

      const result = new Map([['AAA', '10.0.0.2']]);
      resolveScan(result);
      await expect(p1).resolves.toBe(result);
      await expect(p2).resolves.toBe(result);

      // after completion a new call starts a fresh scan
      discover.mockResolvedValue(new Map());
      await platform.discoverDeviceIps();
      expect(MdnsDiscovery).toHaveBeenCalledTimes(2);
    });

    it('starts a fresh scan after a failed one', async () => {
      discover.mockRejectedValueOnce(new Error('fail'));
      const { platform } = build({});
      await expect(platform.discoverDeviceIps()).rejects.toThrow('fail');
      await expect(platform.discoverDeviceIps()).resolves.toBeInstanceOf(Map);
      expect(MdnsDiscovery).toHaveBeenCalledTimes(2);
    });

    it('uses the default discovery timeout when not configured', async () => {
      const { DEFAULT_DISCOVERY_TIMEOUT } = await vi.importActual<typeof DiscoveryModule>('../../src/discovery/index.js');
      const { platform } = build({});
      await platform.discoverDeviceIps();
      expect(discover).toHaveBeenCalledWith({ timeout: DEFAULT_DISCOVERY_TIMEOUT });
    });
  });

  describe('shutdown', () => {
    it('disconnects all accessories', async () => {
      const { handlers, log } = build({ devices: [device('AAA'), device('BBB')] });
      await handlers.get('didFinishLaunching')!();
      await flush();
      expect(devices).toHaveLength(2);

      devices[1].disconnect.mockRejectedValueOnce(new Error('already closed'));
      await handlers.get('shutdown')!();

      for (const d of devices) {
        expect(d.disconnect).toHaveBeenCalledTimes(1);
      }
      expect(log.info).toHaveBeenCalledWith('All devices disconnected');
    });
  });
});
