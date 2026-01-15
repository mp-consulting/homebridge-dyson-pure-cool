/**
 * DysonCloudApi Unit Tests
 *
 * Tests the iOS app authentication flow (from traffic analysis 2026-01-15):
 * 1. POST /v3/userregistration/email/auth - Request OTP (sends email), returns challengeId
 * 2. POST /v3/userregistration/email/verify - Verify OTP with password and get token
 */

import { createCipheriv } from 'node:crypto';

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { DysonCloudApi, CloudApiError, CloudApiErrorType } from '../../../src/discovery/index.js';

/**
 * Helper function to create encrypted credentials for testing
 */
function createEncryptedCredentials(data: { apPasswordHash: string }): string {
  const key = Buffer.from([
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
    0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
  ]);
  const iv = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

/**
 * Helper to create a mock auth response with token (non-2FA flow)
 */
function mockAuthTokenResponse(token = 'test-token-123') {
  return {
    ok: true,
    json: async () => ({
      account: 'test-account',
      token,
      tokenType: 'Bearer',
    }),
  } as Response;
}

/**
 * Helper to create a mock auth response with challengeId (2FA flow)
 */
function mockAuthChallengeResponse(challengeId = 'challenge-123') {
  return {
    ok: true,
    json: async () => ({
      challengeId,
    }),
  } as Response;
}

/**
 * Helper to create a mock v3-style device manifest response
 */
function mockDeviceManifestV3(devices: Array<{
  serial: string;
  name: string;
  type: string;
  credentials?: string;
}>) {
  return {
    ok: true,
    json: async () => devices.map(d => ({
      serialNumber: d.serial,
      name: d.name,
      type: d.type,
      variant: null,
      model: 'TP04',
      category: 'ec',
      connectionCategory: 'wifiOnly',
      productName: 'Dyson Pure Cool',
      connectedConfiguration: d.credentials ? {
        mqtt: {
          remoteBrokerType: 'wss',
          localBrokerCredentials: d.credentials,
          mqttRootTopicLevel: d.type,
        },
        firmware: {
          version: '21.04.03',
          autoUpdateEnabled: true,
          newVersionAvailable: false,
          capabilities: ['Scheduling', 'EnvironmentalData'],
        },
      } : null,
    })),
  } as Response;
}

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

describe('DysonCloudApi', () => {
  let api: DysonCloudApi;

  beforeEach(() => {
    jest.clearAllMocks();
    api = new DysonCloudApi({
      email: 'test@example.com',
      password: 'testpassword',
      countryCode: 'US',
      timeout: 5000,
    });
  });

  describe('authenticate', () => {
    it('should authenticate successfully and store token (non-2FA account)', async () => {
      // Auth returns token directly (non-2FA)
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();

      expect(api.isAuthenticated()).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify auth request
      const [authUrl, authOptions] = mockFetch.mock.calls[0];
      expect(authUrl).toBe('https://appapi.cp.dyson.com/v3/userregistration/email/auth');
      expect((authOptions as RequestInit).method).toBe('POST');

      const body = JSON.parse((authOptions as RequestInit).body as string);
      expect(body.email).toBe('test@example.com');
    });

    it('should throw TWO_FACTOR_REQUIRED when 2FA is needed', async () => {
      // Auth returns challengeId (2FA required)
      mockFetch.mockResolvedValueOnce(mockAuthChallengeResponse());

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.TWO_FACTOR_REQUIRED);
    });

    it('should throw AUTHENTICATION_FAILED on 401 response', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: async () => ({}),
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.AUTHENTICATION_FAILED);
      expect(thrownError?.statusCode).toBe(401);
    });

    it('should throw RATE_LIMITED on 429 response', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        json: async () => ({}),
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.RATE_LIMITED);
    });

    it('should throw ACCOUNT_NOT_FOUND on 404 response', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.ACCOUNT_NOT_FOUND);
    });

    it('should include correct iOS headers in request', async () => {
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();

      const [, options] = mockFetch.mock.calls[0];
      const headers = (options as RequestInit).headers as Record<string, string>;
      expect(headers['User-Agent']).toContain('DysonLink');
      expect(headers['User-Agent']).toContain('CFNetwork');
      expect(headers['User-Agent']).toContain('Darwin');
      expect(headers['X-Platform']).toBe('ios');
      expect(headers.Accept).toBe('application/json');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and store token', async () => {
      // First trigger 2FA
      mockFetch.mockResolvedValueOnce(mockAuthChallengeResponse());

      try {
        await api.authenticate();
      } catch {
        // Expected 2FA error
      }

      // Then verify OTP
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'verified-token' }),
      } as Response);

      await api.verifyOtp('123456');

      expect(api.isAuthenticated()).toBe(true);

      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toBe('https://appapi.cp.dyson.com/v3/userregistration/email/verify');
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.challengeId).toBe('challenge-123');
      expect(body.otpCode).toBe('123456');
      expect(body.email).toBe('test@example.com');
      // Password should be sent in plaintext per Dyson API
      expect(body.password).toBe('testpassword');
    });

    it('should throw error if no active challenge', async () => {
      let thrownError: CloudApiError | null = null;
      try {
        await api.verifyOtp('123456');
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.AUTHENTICATION_FAILED);
    });
  });

  describe('getDevices', () => {
    beforeEach(async () => {
      // Authenticate first (non-2FA flow)
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse('test-token'));
      await api.authenticate();
    });

    it('should retrieve and parse device list (v3 format)', async () => {
      const encryptedCredentials = createEncryptedCredentials({ apPasswordHash: 'local-pass-123' });

      mockFetch.mockResolvedValueOnce(mockDeviceManifestV3([
        { serial: 'ABC-123-DEF', name: 'Living Room Fan', type: '438', credentials: encryptedCredentials },
        { serial: 'XYZ-789-UVW', name: 'Bedroom Fan', type: '527', credentials: encryptedCredentials },
      ]));

      const devices = await api.getDevices();

      expect(devices).toHaveLength(2);

      expect(devices[0].serial).toBe('ABC-123-DEF');
      expect(devices[0].name).toBe('Living Room Fan');
      expect(devices[0].productType).toBe('438');
      expect(devices[0].localCredentials).toBe('local-pass-123');

      expect(devices[1].serial).toBe('XYZ-789-UVW');
      expect(devices[1].productType).toBe('527');
    });

    it('should throw error if not authenticated', async () => {
      api.logout();

      let thrownError: CloudApiError | null = null;
      try {
        await api.getDevices();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.AUTHENTICATION_FAILED);
    });

    it('should handle empty device list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      } as Response);

      const devices = await api.getDevices();
      expect(devices).toHaveLength(0);
    });

    it('should filter out non-connected devices', async () => {
      const encryptedCredentials = createEncryptedCredentials({ apPasswordHash: 'local-pass-123' });

      // Mix of connected and non-connected devices (like vacuum cleaner)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            serialNumber: 'ABC-123-DEF',
            name: 'Living Room Fan',
            type: '438',
            connectedConfiguration: {
              mqtt: {
                remoteBrokerType: 'wss',
                localBrokerCredentials: encryptedCredentials,
                mqttRootTopicLevel: '438',
              },
              firmware: { autoUpdateEnabled: true },
            },
          },
          {
            serialNumber: 'Z6R-EU-UCA0541A',
            name: 'Vacuum',
            type: '545',
            connectedConfiguration: null, // Non-connected device
          },
        ]),
      } as Response);

      const devices = await api.getDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].serial).toBe('ABC-123-DEF');
    });

    it('should include authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      } as Response);

      await api.getDevices();

      // Skip the first call (auth)
      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toBe('https://appapi.cp.dyson.com/v2/provisioningservice/manifest');
      expect((options as RequestInit).headers as Record<string, string>).toHaveProperty('Authorization', 'Bearer test-token');
    });

    it('should handle SESSION_EXPIRED on 403 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      } as Response);

      let thrownError: CloudApiError | null = null;
      try {
        await api.getDevices();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.SESSION_EXPIRED);
    });
  });

  describe('logout', () => {
    it('should clear authentication state', async () => {
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();
      expect(api.isAuthenticated()).toBe(true);

      api.logout();
      expect(api.isAuthenticated()).toBe(false);
    });
  });

  describe('getAuthToken', () => {
    it('should return null when not authenticated', () => {
      expect(api.getAuthToken()).toBeNull();
    });

    it('should return token when authenticated', async () => {
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse('my-token'));

      await api.authenticate();
      expect(api.getAuthToken()).toBe('my-token');
    });
  });

  describe('network errors', () => {
    it('should handle network timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.NETWORK_ERROR);
    });

    it('should handle generic network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unavailable'));

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.NETWORK_ERROR);
      expect(thrownError?.message).toContain('Network unavailable');
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limiting between requests', async () => {
      const startTime = Date.now();

      // First request (auth)
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();

      // Second request (get devices)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      } as Response);
      await api.getDevices();

      const elapsed = Date.now() - startTime;
      // Should have delay between requests (2 requests = at least 1 second delay)
      expect(elapsed).toBeGreaterThanOrEqual(900); // Allow small margin
    });
  });

  describe('credential decryption', () => {
    it('should return empty string for invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());
      await api.authenticate();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            serialNumber: 'ABC-123',
            name: 'Test Device',
            type: '438',
            connectedConfiguration: {
              mqtt: {
                remoteBrokerType: 'wss',
                localBrokerCredentials: 'invalid-base64-garbage',
                mqttRootTopicLevel: '438',
              },
              firmware: { autoUpdateEnabled: true },
            },
          },
        ]),
      } as Response);

      const devices = await api.getDevices();
      expect(devices[0].localCredentials).toBe('');
    });
  });
});
