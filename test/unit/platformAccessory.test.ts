/**
 * DysonPlatformAccessory Unit Tests
 */

import { EventEmitter } from 'events';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DysonPlatformAccessory } from '../../src/platformAccessory.js';
import { createDevice } from '../../src/devices/deviceFactory.js';
import { DysonLinkAccessory } from '../../src/accessories/dysonLinkAccessory.js';
import type { DysonPureCoolPlatform } from '../../src/platform.js';
import type { PlatformAccessory } from 'homebridge';
import { createMockLog } from '../helpers/mocks.js';

vi.mock('../../src/devices/deviceFactory.js', () => ({
  createDevice: vi.fn(),
}));

vi.mock('../../src/accessories/dysonLinkAccessory.js', () => ({
  DysonLinkAccessory: vi.fn(),
}));

const RETRY_MS = 5 * 60 * 1000;

class FakeDevice extends EventEmitter {
  connect = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn().mockResolvedValue(undefined);
  setIpAddress = vi.fn();
  setPollingInterval = vi.fn();
  getActiveVariant = vi.fn((): { label: string; protocolVersion: number; clean: boolean } | null => null);
  constructor(private readonly serial: string) {
    super();
  }
  getSerial() {
    return this.serial;
  }
}

function createPlatform(config: Record<string, unknown> = {}) {
  const log = createMockLog();
  const platform = {
    log,
    config,
    api: { updatePlatformAccessories: vi.fn() },
    discoverDeviceIps: vi.fn().mockResolvedValue(new Map<string, string>()),
  };
  return platform;
}

function createAccessory(device: Record<string, unknown>, extraContext: Record<string, unknown> = {}) {
  return {
    displayName: 'Test',
    UUID: 'uuid',
    context: { device, ...extraContext },
  } as unknown as PlatformAccessory;
}

const VALID_CONFIG = {
  serial: 'ABC-EU-12345678',
  productType: '438',
  name: 'Living Room',
  credentials: 'secret',
  ipAddress: '192.168.1.10',
};

async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe('DysonPlatformAccessory', () => {
  let device: FakeDevice;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(createDevice).mockReset();
    vi.mocked(DysonLinkAccessory).mockReset();
    device = new FakeDevice(VALID_CONFIG.serial);
    vi.mocked(createDevice).mockImplementation(() => device as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function build(cfg: Record<string, unknown>, platformConfig: Record<string, unknown> = {}, extraContext = {}) {
    const platform = createPlatform(platformConfig);
    const accessory = createAccessory({ ...cfg }, extraContext);
    const pa = new DysonPlatformAccessory(platform as unknown as DysonPureCoolPlatform, accessory);
    return { platform, accessory, pa };
  }

  describe('config validation', () => {
    it.each([
      ['serial', 'missing serial number'],
      ['productType', 'missing product type'],
      ['credentials', 'missing credentials'],
    ])('does not create a device when %s is missing', (field, message) => {
      const cfg: Record<string, unknown> = { ...VALID_CONFIG };
      delete cfg[field];
      const { platform, pa } = build(cfg);

      expect(createDevice).not.toHaveBeenCalled();
      expect(DysonLinkAccessory).not.toHaveBeenCalled();
      expect(pa.getDevice()).toBeUndefined();
      expect(pa.getAccessoryHandler()).toBeUndefined();
      expect(platform.log.error).toHaveBeenCalledWith(expect.stringContaining(message));
    });

    it('does not create a device for an unsupported product type', () => {
      const { platform, pa } = build({ ...VALID_CONFIG, productType: '999' });

      expect(createDevice).not.toHaveBeenCalled();
      expect(pa.getDevice()).toBeUndefined();
      expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining('Unsupported device type'));
    });
  });

  describe('initialization', () => {
    it('passes credentials and device info to createDevice', () => {
      build(VALID_CONFIG);
      expect(createDevice).toHaveBeenCalledWith({
        serial: VALID_CONFIG.serial,
        productType: '438',
        name: 'Living Room',
        credentials: 'secret',
        ipAddress: '192.168.1.10',
      });
    });

    it('falls back to localCredentials and a default name', () => {
      const cfg: Record<string, unknown> = { ...VALID_CONFIG, localCredentials: 'local-secret' };
      delete cfg.credentials;
      delete cfg.name;
      build(cfg);
      expect(createDevice).toHaveBeenCalledWith(expect.objectContaining({
        credentials: 'local-secret',
        name: `Dyson ${VALID_CONFIG.serial}`,
      }));
    });

    it('prefers credentials over localCredentials', () => {
      build({ ...VALID_CONFIG, localCredentials: 'local-secret' });
      expect(createDevice).toHaveBeenCalledWith(expect.objectContaining({ credentials: 'secret' }));
    });

    it('creates DysonLinkAccessory with options and firmwareVersion', () => {
      const { platform, accessory, pa } = build({
        ...VALID_CONFIG,
        firmwareVersion: '21.04.03',
        temperatureOffset: -1,
        isNightModeEnabled: true,
      });

      expect(DysonLinkAccessory).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(DysonLinkAccessory).mock.calls[0][0];
      expect(arg.accessory).toBe(accessory);
      expect(arg.device).toBe(device);
      expect(arg.api).toBe(platform.api);
      expect(arg.log).toBe(platform.log);
      expect(arg.firmwareVersion).toBe('21.04.03');
      expect(arg.options).toMatchObject({ temperatureOffset: -1, isNightModeEnabled: true });
      expect(pa.getDevice()).toBe(device);
      expect(pa.getAccessoryHandler()).toBe(vi.mocked(DysonLinkAccessory).mock.instances[0]);
    });

    it('applies the polling interval from the platform config', () => {
      build(VALID_CONFIG, { pollingInterval: 30 });
      expect(device.setPollingInterval).toHaveBeenCalledWith(30);
    });

    it('does not set a polling interval when not configured', () => {
      build(VALID_CONFIG);
      expect(device.setPollingInterval).not.toHaveBeenCalled();
    });

    it('logs and swallows errors thrown while creating the device', () => {
      vi.mocked(createDevice).mockImplementation(() => {
        throw new Error('boom');
      });
      const { platform } = build(VALID_CONFIG);
      expect(platform.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize device'),
        expect.any(Error),
      );
    });

    it('does not connect when no IP address is configured', async () => {
      const cfg: Record<string, unknown> = { ...VALID_CONFIG };
      delete cfg.ipAddress;
      const { platform } = build(cfg);
      await flush();
      expect(device.connect).not.toHaveBeenCalled();
      expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining('no IP address'));
    });
  });

  describe('connection', () => {
    it('connects on startup', async () => {
      const { platform } = build(VALID_CONFIG);
      await flush();
      expect(device.connect).toHaveBeenCalledTimes(1);
      expect(platform.log.info).toHaveBeenCalledWith(`Connected to ${VALID_CONFIG.serial}`);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('logs the fallback variant when one was used', async () => {
      device.getActiveVariant.mockReturnValue({ label: 'v3-clean', protocolVersion: 3, clean: true });
      const { platform } = build(VALID_CONFIG);
      await flush();
      expect(platform.log.info).toHaveBeenCalledWith(expect.stringContaining("fallback variant 'v3-clean'"));
    });

    it('reuses the same device at a new mDNS IP and persists the override', async () => {
      device.connect.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(undefined);
      const platform = createPlatform();
      platform.discoverDeviceIps.mockResolvedValue(new Map([[VALID_CONFIG.serial, '192.168.1.99']]));
      const accessory = createAccessory({ ...VALID_CONFIG });
      new DysonPlatformAccessory(platform as unknown as DysonPureCoolPlatform, accessory);
      await flush();

      expect(platform.discoverDeviceIps).toHaveBeenCalledTimes(1);
      expect(createDevice).toHaveBeenCalledTimes(1);
      expect(DysonLinkAccessory).toHaveBeenCalledTimes(1);
      expect(device.disconnect).toHaveBeenCalledTimes(1);
      expect(device.setIpAddress).toHaveBeenCalledWith('192.168.1.99');
      expect(device.connect).toHaveBeenCalledTimes(2);
      // order: disconnect -> setIpAddress -> connect
      expect(device.disconnect.mock.invocationCallOrder[0])
        .toBeLessThan(device.setIpAddress.mock.invocationCallOrder[0]);
      expect(device.setIpAddress.mock.invocationCallOrder[0])
        .toBeLessThan(device.connect.mock.invocationCallOrder[1]);

      expect(accessory.context.ipOverride).toEqual({ from: '192.168.1.10', to: '192.168.1.99' });
      expect(accessory.context.device.ipAddress).toBe('192.168.1.99');
      expect(platform.api.updatePlatformAccessories).toHaveBeenCalledWith([accessory]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the original "from" IP of an existing override', async () => {
      device.connect.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(undefined);
      const platform = createPlatform();
      platform.discoverDeviceIps.mockResolvedValue(new Map([[VALID_CONFIG.serial, '192.168.1.50']]));
      const accessory = createAccessory(
        { ...VALID_CONFIG, ipAddress: '192.168.1.99' },
        { ipOverride: { from: '192.168.1.10', to: '192.168.1.99' } },
      );
      new DysonPlatformAccessory(platform as unknown as DysonPureCoolPlatform, accessory);
      await flush();

      expect(accessory.context.ipOverride).toEqual({ from: '192.168.1.10', to: '192.168.1.50' });
    });

    it('restores the old IP and schedules a retry when the new IP also fails', async () => {
      device.connect.mockRejectedValue(new Error('unreachable'));
      const platform = createPlatform();
      platform.discoverDeviceIps.mockResolvedValue(new Map([[VALID_CONFIG.serial, '192.168.1.99']]));
      const accessory = createAccessory({ ...VALID_CONFIG });
      new DysonPlatformAccessory(platform as unknown as DysonPureCoolPlatform, accessory);
      await flush();

      expect(device.setIpAddress).toHaveBeenNthCalledWith(1, '192.168.1.99');
      expect(device.setIpAddress).toHaveBeenNthCalledWith(2, '192.168.1.10');
      expect(accessory.context.ipOverride).toBeUndefined();
      expect(platform.api.updatePlatformAccessories).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);

      device.connect.mockClear();
      await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
      expect(device.connect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(device.connect).toHaveBeenCalled();
    });

    it('schedules a retry when mDNS finds the same IP', async () => {
      device.connect.mockRejectedValueOnce(new Error('timeout'));
      const platform = createPlatform();
      platform.discoverDeviceIps.mockResolvedValue(new Map([[VALID_CONFIG.serial, VALID_CONFIG.ipAddress]]));
      const accessory = createAccessory({ ...VALID_CONFIG });
      new DysonPlatformAccessory(platform as unknown as DysonPureCoolPlatform, accessory);
      await flush();

      expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining('found at same IP'));
      expect(device.setIpAddress).not.toHaveBeenCalled();
      expect(device.connect).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(device.connect).toHaveBeenCalledTimes(2);
    });

    it('schedules a retry when mDNS does not find the device', async () => {
      device.connect.mockRejectedValueOnce('offline');
      const { platform } = build(VALID_CONFIG);
      await flush();

      expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining('not found on network'));
      expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining(': offline'));
      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(device.connect).toHaveBeenCalledTimes(2);
    });

    it('schedules a retry when mDNS discovery throws', async () => {
      device.connect.mockRejectedValueOnce(new Error('timeout'));
      const platform = createPlatform();
      platform.discoverDeviceIps.mockRejectedValue(new Error('socket error'));
      const accessory = createAccessory({ ...VALID_CONFIG });
      new DysonPlatformAccessory(platform as unknown as DysonPureCoolPlatform, accessory);
      await flush();

      expect(platform.log.error).toHaveBeenCalledWith('mDNS discovery failed:', expect.any(Error));
      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(device.connect).toHaveBeenCalledTimes(2);
    });
  });

  describe('device events', () => {
    it('schedules a retry on reconnectFailed', async () => {
      build(VALID_CONFIG);
      await flush();
      expect(device.connect).toHaveBeenCalledTimes(1);

      device.emit('reconnectFailed');
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(device.connect).toHaveBeenCalledTimes(2);
    });

    it('does not schedule a retry on reconnectFailed after disconnect()', async () => {
      const { pa } = build(VALID_CONFIG);
      await flush();
      await pa.disconnect();

      device.emit('reconnectFailed');
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
      expect(device.connect).toHaveBeenCalledTimes(1);
    });

    it('logs error events instead of crashing', async () => {
      const { platform } = build(VALID_CONFIG);
      await flush();
      expect(() => device.emit('error', new Error('mqtt broke'))).not.toThrow();
      expect(platform.log.error).toHaveBeenCalledWith(`[${VALID_CONFIG.serial}] Device error: mqtt broke`);
    });
  });

  describe('disconnect', () => {
    it('clears a pending retry timer', async () => {
      device.connect.mockRejectedValueOnce(new Error('timeout'));
      const { pa } = build(VALID_CONFIG);
      await flush();
      expect(vi.getTimerCount()).toBe(1);

      await pa.disconnect();
      expect(vi.getTimerCount()).toBe(0);
      expect(device.disconnect).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
      expect(device.connect).toHaveBeenCalledTimes(1);
    });

    it('logs errors from device.disconnect()', async () => {
      const { pa, platform } = build(VALID_CONFIG);
      await flush();
      device.disconnect.mockRejectedValueOnce(new Error('nope'));
      await expect(pa.disconnect()).resolves.toBeUndefined();
      expect(platform.log.error).toHaveBeenCalledWith('Error disconnecting from device:', expect.any(Error));
    });

    it('is a no-op without a device', async () => {
      const { pa } = build({ ...VALID_CONFIG, productType: '999' });
      await expect(pa.disconnect()).resolves.toBeUndefined();
    });
  });
});
