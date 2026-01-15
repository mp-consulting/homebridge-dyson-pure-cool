/**
 * DysonCloudApi Unit Tests
 *
 * Tests the v3 authentication flow:
 * 1. POST /v3/userregistration/email/userstatus - Check account status
 * 2. POST /v3/userregistration/email/auth - Request OTP
 * 3. POST /v3/userregistration/email/verify - Verify OTP and get token
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
 * Helper to create a mock user status response (active account)
 */
function mockUserStatusResponse() {
  return {
    ok: true,
    json: async () => ({
      accountStatus: 'ACTIVE',
      authenticationMethod: 'EMAIL_PWD_2FA',
    }),
  } as Response;
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
      // Step 1: User status check
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
      // Step 2: Auth returns token directly (non-2FA)
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();

      expect(api.isAuthenticated()).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify user status request
      const [statusUrl, statusOptions] = mockFetch.mock.calls[0];
      expect(statusUrl).toBe('https://appapi.cp.dyson.com/v3/userregistration/email/userstatus');
      expect((statusOptions as RequestInit).method).toBe('POST');
      expect(((statusOptions as RequestInit).headers as Record<string, string>).country).toBe('US');

      // Verify auth request
      const [authUrl, authOptions] = mockFetch.mock.calls[1];
      expect(authUrl).toBe('https://appapi.cp.dyson.com/v3/userregistration/email/auth');
      expect((authOptions as RequestInit).method).toBe('POST');
      expect(((authOptions as RequestInit).headers as Record<string, string>).country).toBe('US');
      expect(((authOptions as RequestInit).headers as Record<string, string>).culture).toBe('en-US');

      const body = JSON.parse((authOptions as RequestInit).body as string);
      expect(body.email).toBe('test@example.com');
    });

    it('should throw TWO_FACTOR_REQUIRED when 2FA is needed', async () => {
      // Step 1: User status check
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
      // Step 2: Auth returns challengeId (2FA required)
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

    it('should throw ACCOUNT_NOT_FOUND when account is not active', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accountStatus: 'INACTIVE',
          authenticationMethod: 'EMAIL_PWD_2FA',
        }),
      } as Response);

      let thrownError: CloudApiError | null = null;
      try {
        await api.authenticate();
      } catch (error) {
        thrownError = error as CloudApiError;
      }

      expect(thrownError).toBeInstanceOf(CloudApiError);
      expect(thrownError?.type).toBe(CloudApiErrorType.ACCOUNT_NOT_FOUND);
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

    it('should include correct headers in request', async () => {
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();

      const [, options] = mockFetch.mock.calls[0];
      const headers = (options as RequestInit).headers as Record<string, string>;
      expect(headers['User-Agent']).toContain('Dalvik');
      expect(headers.Accept).toBe('application/json');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and store token', async () => {
      // First trigger 2FA
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
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

      const [url, options] = mockFetch.mock.calls[2];
      expect(url).toBe('https://appapi.cp.dyson.com/v3/userregistration/email/verify');
      expect(((options as RequestInit).headers as Record<string, string>).country).toBe('US');
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.challengeId).toBe('challenge-123');
      expect(body.otpCode).toBe('123456');
      expect(body.email).toBe('test@example.com');
      // Password should be sent in plaintext per Dyson v3 API
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
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse('test-token'));
      await api.authenticate();
    });

    it('should retrieve and parse device list', async () => {
      const encryptedCredentials = createEncryptedCredentials({ apPasswordHash: 'local-pass-123' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            Serial: 'ABC-123-DEF',
            Name: 'Living Room Fan',
            ProductType: '438',
            Version: '21.04.03',
            LocalCredentials: encryptedCredentials,
            AutoUpdate: true,
            NewVersionAvailable: false,
          },
          {
            Serial: 'XYZ-789-UVW',
            Name: 'Bedroom Fan',
            ProductType: '527',
            Version: '22.01.01',
            LocalCredentials: encryptedCredentials,
            AutoUpdate: false,
            NewVersionAvailable: true,
          },
        ]),
      } as Response);

      const devices = await api.getDevices();

      expect(devices).toHaveLength(2);

      expect(devices[0].serial).toBe('ABC-123-DEF');
      expect(devices[0].name).toBe('Living Room Fan');
      expect(devices[0].productType).toBe('438');
      expect(devices[0].version).toBe('21.04.03');
      expect(devices[0].autoUpdate).toBe(true);
      expect(devices[0].newVersionAvailable).toBe(false);
      expect(devices[0].localCredentials).toBe('local-pass-123');

      expect(devices[1].serial).toBe('XYZ-789-UVW');
      expect(devices[1].productType).toBe('527');
      expect(devices[1].newVersionAvailable).toBe(true);
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

    it('should include authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      } as Response);

      await api.getDevices();

      // Skip the first two calls (user status + auth)
      const [url, options] = mockFetch.mock.calls[2];
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
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
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
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
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

      // First request (user status)
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
      // Second request (auth)
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());

      await api.authenticate();

      // Third request (get devices)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      } as Response);
      await api.getDevices();

      const elapsed = Date.now() - startTime;
      // Should have delays between requests (3 requests = at least 2 second delay)
      expect(elapsed).toBeGreaterThanOrEqual(1800); // Allow small margin
    });
  });

  describe('credential decryption', () => {
    it('should return empty string for invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce(mockUserStatusResponse());
      mockFetch.mockResolvedValueOnce(mockAuthTokenResponse());
      await api.authenticate();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            Serial: 'ABC-123',
            Name: 'Test Device',
            ProductType: '438',
            Version: '1.0.0',
            LocalCredentials: 'invalid-base64-garbage',
            AutoUpdate: true,
            NewVersionAvailable: false,
          },
        ]),
      } as Response);

      const devices = await api.getDevices();
      expect(devices[0].localCredentials).toBe('');
    });
  });
});
