/**
 * Homebridge custom UI server (homebridge-ui/server.js) Unit Tests
 *
 * The server instantiates itself on import, so the plugin-ui-utils base class is
 * mocked to capture the registered request handlers, and the compiled dist
 * modules it depends on (MQTT client, mDNS discovery, device catalog) are mocked.
 */

import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: any) => Promise<any>>(),
  instance: null as any,
  discovered: new Map<string, string>(),
  failingHosts: new Set<string>(),
  mqttHosts: [] as string[],
}));

vi.mock('@homebridge/plugin-ui-utils', () => {
  class RequestError extends Error {
    requestError: unknown;
    constructor(message: string, requestError?: unknown) {
      super(message);
      this.requestError = requestError;
    }
  }
  class HomebridgePluginUiServer {
    constructor() {
      mocks.instance = this;
    }
    onRequest(path: string, fn: (payload: any) => Promise<any>) {
      mocks.handlers.set(path, fn);
    }
    ready() {}
  }
  return { HomebridgePluginUiServer, RequestError };
});

vi.mock('../../../dist/config/index.js', () => ({
  getProductTypeDisplayNames: () => ({ '438': 'Pure Cool Tower' }),
  getDeviceFeatures: () => ({ heating: false, humidifier: false, oscillation: true, frontAirflow: false }),
  getHeatingDevices: () => [],
}));

vi.mock('../../../dist/discovery/mdnsDiscovery.js', () => ({
  MdnsDiscovery: class {
    async discover() {
      return new Map(mocks.discovered);
    }
  },
}));

vi.mock('../../../dist/protocol/mqttClient.js', () => ({
  DysonMqttClient: class {
    host: string;
    constructor(options: { host: string }) {
      this.host = options.host;
      mocks.mqttHosts.push(options.host);
    }
    async connect() {
      if (mocks.failingHosts.has(this.host)) {
        throw new Error('connect ECONNREFUSED');
      }
    }
    async publishCommand() {}
    async disconnect() {}
  },
}));

/** The parts of homebridge-ui/server.js (plain JS, no typings) these tests call */
interface UiServerModule {
  isPrivateIPv4(ip: unknown): boolean;
}

// Imported through a variable so tsc does not look for typings of the JS module
const SERVER_MODULE = '../../../homebridge-ui/server.js';
const server = await import(SERVER_MODULE) as UiServerModule;

function handler(path: string) {
  const fn = mocks.handlers.get(path);
  if (!fn) {
    throw new Error(`No handler registered for ${path}`);
  }
  return fn;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status });
}

/** Queue fetch responses in call order */
function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(r);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const SECRET_TOKEN = 'tok-SUPER-SECRET-123';
const SECRET_CHALLENGE = 'challenge-SECRET-456';
const validAuth = { email: 'user@example.com', password: 'hunter2', countryCode: 'US' };

describe('homebridge-ui server', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.discovered.clear();
    mocks.failingHosts.clear();
    mocks.mqttHosts.length = 0;
  });

  afterEach(() => {
    if (mocks.instance?._pendingAuthTimer) {
      clearTimeout(mocks.instance._pendingAuthTimer);
    }
    mocks.instance.pendingAuth = null;
    mocks.instance.challengeId = null;
    mocks.instance._pendingAuthTimer = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const allLogged = () => [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
    .map((args) => args.map(String).join(' '))
    .join('\n');

  it('registers all request handlers', () => {
    expect([...mocks.handlers.keys()]).toEqual(expect.arrayContaining([
      '/authenticate', '/verify-otp', '/get-devices', '/get-product-types', '/get-device-state', '/set-continuous-monitoring',
    ]));
  });

  describe('response logging', () => {
    it('never logs response bodies (tokens, challenge IDs)', async () => {
      mockFetch(
        jsonResponse({ version: '1' }),
        jsonResponse({ accountStatus: 'ACTIVE' }),
        jsonResponse({ challengeId: SECRET_CHALLENGE }),
        jsonResponse({ token: SECRET_TOKEN }),
      );

      await expect(handler('/authenticate')(validAuth)).resolves.toEqual({ success: true, requires2FA: true });
      await expect(handler('/verify-otp')({ otpCode: '123456' })).resolves.toEqual({ success: true, token: SECRET_TOKEN });

      const logged = allLogged();
      expect(logged).not.toContain(SECRET_TOKEN);
      expect(logged).not.toContain(SECRET_CHALLENGE);
      expect(logged).not.toContain('hunter2');
      expect(logged).toMatch(/Response status: 200 \(\d+ bytes\)/);
    });

    it('does not log device credentials from the manifest', async () => {
      mockFetch(jsonResponse([{ Serial: 'ABC-US-1', ProductType: '438', Name: 'Fan', LocalCredentials: 'LOCALCREDS-SECRET' }]));

      const result = await handler('/get-devices')({ token: SECRET_TOKEN });

      expect(result.devices).toHaveLength(1);
      const logged = allLogged();
      expect(logged).not.toContain('LOCALCREDS-SECRET');
      expect(logged).not.toContain(SECRET_TOKEN);
    });
  });

  describe('pending auth cleanup', () => {
    it('clears pendingAuth, challengeId and timer when auth start fails with a RequestError', async () => {
      mockFetch(jsonResponse({ version: '1' }), jsonResponse({ accountStatus: 'UNKNOWN' }));

      await expect(handler('/authenticate')(validAuth)).rejects.toThrow('Account not active or not found');

      expect(mocks.instance.pendingAuth).toBeNull();
      expect(mocks.instance.challengeId).toBeNull();
      expect(mocks.instance._pendingAuthTimer).toBeNull();
      await expect(handler('/verify-otp')({ otpCode: '123456' })).rejects.toThrow('No pending authentication');
    });

    it('clears pending auth when the Dyson API returns an HTTP error', async () => {
      mockFetch(jsonResponse({ Message: 'Server exploded' }, 500));

      await expect(handler('/authenticate')(validAuth)).rejects.toThrow('Server exploded');

      expect(mocks.instance.pendingAuth).toBeNull();
      expect(mocks.instance._pendingAuthTimer).toBeNull();
    });

    it('clears pending auth on network errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));

      await expect(handler('/authenticate')(validAuth)).rejects.toThrow('Network error');

      expect(mocks.instance.pendingAuth).toBeNull();
    });

    it('keeps the challenge after an invalid OTP so the user can retry', async () => {
      mockFetch(
        jsonResponse({ version: '1' }),
        jsonResponse({ accountStatus: 'ACTIVE' }),
        jsonResponse({ challengeId: SECRET_CHALLENGE }),
        jsonResponse({ Message: 'Invalid OTP' }, 400),
      );

      await handler('/authenticate')(validAuth);
      await expect(handler('/verify-otp')({ otpCode: '000000' })).rejects.toThrow('Invalid verification code');

      expect(mocks.instance.challengeId).toBe(SECRET_CHALLENGE);
      expect(mocks.instance.pendingAuth).not.toBeNull();
    });

    it('clears everything after a successful verification', async () => {
      mockFetch(
        jsonResponse({ version: '1' }),
        jsonResponse({ accountStatus: 'ACTIVE' }),
        jsonResponse({ challengeId: SECRET_CHALLENGE }),
        jsonResponse({ token: SECRET_TOKEN }),
      );

      await handler('/authenticate')(validAuth);
      await handler('/verify-otp')({ otpCode: '123456' });

      expect(mocks.instance.pendingAuth).toBeNull();
      expect(mocks.instance.challengeId).toBeNull();
      expect(mocks.instance._pendingAuthTimer).toBeNull();
    });
  });

  describe('input validation', () => {
    it.each([
      [{ ...validAuth, email: 'not-an-email' }, 'valid email'],
      [{ ...validAuth, email: 42 }, 'valid email'],
      [{ ...validAuth, email: `${'a'.repeat(250)}@example.com` }, 'valid email'],
      [{ ...validAuth, password: '' }, 'Password is required'],
      [{ ...validAuth, password: ['x'] }, 'Password is required'],
      [{ ...validAuth, countryCode: 'USA' }, 'Country code'],
      [{ ...validAuth, countryCode: 'U1' }, 'Country code'],
      [{ ...validAuth, countryCode: 7 }, 'Country code'],
    ])('rejects invalid authenticate payload %#', async (payload, message) => {
      const fetchMock = mockFetch();

      const promise = handler('/authenticate')(payload);
      await expect(promise).rejects.toThrow(message);
      await promise.catch((e: any) => expect(e.requestError).toEqual({ status: 400 }));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.instance.pendingAuth).toBeNull();
    });

    it('uppercases a lowercase country code', async () => {
      const fetchMock = mockFetch(jsonResponse({ version: '1' }), jsonResponse({ accountStatus: 'ACTIVE' }), jsonResponse({ challengeId: 'c' }));

      await handler('/authenticate')({ ...validAuth, countryCode: 'gb' });

      expect(fetchMock.mock.calls[1][0]).toContain('country=GB');
      expect(mocks.instance.pendingAuth.countryCode).toBe('GB');
    });

    it.each(['12345', '1234567', 'abcdef', 123456, undefined])('rejects invalid OTP code %s', async (otpCode) => {
      await expect(handler('/verify-otp')({ otpCode })).rejects.toThrow('Verification code must be 6 digits');
    });

    it.each(['evil.example.com', '999.1.1.1', '::1', 42])('rejects non-IPv4 ipAddress %s', async (ipAddress) => {
      const payload = { serial: 'ABC-US-1', productType: '438', localCredentials: 'x', enabled: true, ipAddress };
      await expect(handler('/set-continuous-monitoring')(payload)).rejects.toThrow('ipAddress must be a valid IPv4 address');
      await expect(handler('/get-device-state')(payload)).rejects.toThrow('ipAddress must be a valid IPv4 address');
      expect(mocks.mqttHosts).toEqual([]);
    });
  });

  describe('mDNS fallback', () => {
    const basePayload = { serial: 'ABC-US-1', productType: '438', localCredentials: 'x', enabled: true };

    it('ignores a non-private mDNS address', async () => {
      mocks.discovered.set('ABC-US-1', '8.8.8.8');

      await expect(handler('/set-continuous-monitoring')(basePayload)).rejects.toThrow('not found on network');

      expect(mocks.mqttHosts).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a private IPv4 address'));
    });

    it('uses a private mDNS address and returns it as discoveredIp', async () => {
      mocks.discovered.set('ABC-US-1', '192.168.1.50');

      const result = await handler('/set-continuous-monitoring')(basePayload);

      expect(mocks.mqttHosts).toEqual(['192.168.1.50']);
      expect(result.discoveredIp).toBe('192.168.1.50');
    });

    it('warns when mDNS reports a different IP than the cached one and retries with it', async () => {
      mocks.failingHosts.add('192.168.1.10');
      mocks.discovered.set('ABC-US-1', '10.0.0.20');

      const result = await handler('/set-continuous-monitoring')({ ...basePayload, ipAddress: '192.168.1.10' });

      expect(mocks.mqttHosts).toEqual(['192.168.1.10', '10.0.0.20']);
      expect(result.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('differs from the cached/configured IP'));
    });

    it('does not retry against a public mDNS address after the cached IP fails', async () => {
      mocks.failingHosts.add('192.168.1.10');
      mocks.discovered.set('ABC-US-1', '203.0.113.5');

      await expect(handler('/set-continuous-monitoring')({ ...basePayload, ipAddress: '192.168.1.10' }))
        .rejects.toThrow('Failed to set continuous monitoring');

      expect(mocks.mqttHosts).toEqual(['192.168.1.10']);
    });
  });

  describe('isPrivateIPv4', () => {
    it.each([
      ['10.0.0.1', true],
      ['10.255.255.255', true],
      ['172.16.0.1', true],
      ['172.31.255.255', true],
      ['172.15.0.1', false],
      ['172.32.0.1', false],
      ['192.168.0.1', true],
      ['192.169.0.1', false],
      ['169.254.1.1', false],
      ['127.0.0.1', false],
      ['8.8.8.8', false],
      ['fe80::1', false],
      ['not-an-ip', false],
      [undefined, false],
    ])('%s -> %s', (ip, expected) => {
      expect(server.isPrivateIPv4(ip)).toBe(expected);
    });
  });
});
