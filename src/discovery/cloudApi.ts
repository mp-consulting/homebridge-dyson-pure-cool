/**
 * Dyson Cloud API Client
 * Handles authentication and device list retrieval from Dyson cloud services
 *
 * Authentication flow (from Android app analysis 2026-01-15):
 * 1. POST /v3/userregistration/email/userstatus - Check account status
 * 2. POST /v3/userregistration/email/auth - Request OTP (sends email)
 * 3. POST /v3/userregistration/email/verify - Verify OTP and get token
 *
 * Device retrieval:
 * - GET /v2/provisioningservice/manifest - Get devices with LocalCredentials
 * - GET /v3/manifest - Get devices with newer format (localBrokerCredentials)
 */

import { createDecipheriv } from 'node:crypto';

import type {
  AuthResponse,
  ChallengeResponse,
  CloudApiConfig,
  CloudDeviceInfo,
  DeviceCredentials,
  DeviceInfo,
  RawDeviceManifestV2,
  RawDeviceManifestV3,
  UserStatusResponse,
} from './types.js';
import { CloudApiError, CloudApiErrorType } from './types.js';

/** Dyson Cloud API base URL */
const DYSON_API_BASE_URL = 'https://appapi.cp.dyson.com';

/** Default request timeout (15 seconds) */
const DEFAULT_TIMEOUT = 15000;

/** Rate limit delay between requests (1 second) */
const RATE_LIMIT_DELAY = 1000;

/** Encryption key for LocalCredentials decryption */
const DECRYPT_KEY = Buffer.from([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
]);

/** Initialization vector for LocalCredentials decryption */
const DECRYPT_IV = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/**
 * Dyson Cloud API Client
 * Retrieves device list and credentials from Dyson cloud services
 *
 * @example
 * ```typescript
 * const api = new DysonCloudApi({ email: 'user@example.com', password: 'pass' });
 * await api.authenticate();
 * const devices = await api.getDevices();
 * ```
 */
export class DysonCloudApi {
  private readonly email: string;
  private readonly password: string;
  private readonly countryCode: string;
  private readonly timeout: number;

  private authToken: string | null = null;
  private challengeId: string | null = null;
  private lastRequestTime = 0;

  constructor(config: CloudApiConfig) {
    this.email = config.email;
    this.password = config.password;
    this.countryCode = config.countryCode ?? 'US';
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Authenticate with Dyson Cloud API
   * Flow: Check user status -> Request OTP -> Wait for verifyOtp()
   *
   * @throws {CloudApiError} If authentication fails or 2FA is required
   */
  async authenticate(): Promise<void> {
    await this.rateLimitDelay();

    // Step 1: Check user status
    const statusResponse = await this.request<UserStatusResponse>(
      '/v3/userregistration/email/userstatus',
      {
        method: 'POST',
        body: JSON.stringify({
          email: this.email,
        }),
        headers: {
          'Content-Type': 'application/json',
          'country': this.countryCode,
        },
      },
    );

    if (statusResponse.accountStatus !== 'ACTIVE') {
      throw new CloudApiError(
        CloudApiErrorType.ACCOUNT_NOT_FOUND,
        'Account not active or not found. Please check your email address.',
      );
    }

    await this.rateLimitDelay();

    // Step 2: Request OTP (initiates email with verification code)
    const response = await this.request<AuthResponse | ChallengeResponse>(
      '/v3/userregistration/email/auth',
      {
        method: 'POST',
        body: JSON.stringify({
          email: this.email,
        }),
        headers: {
          'Content-Type': 'application/json',
          'country': this.countryCode,
          'culture': `en-${this.countryCode}`,
        },
      },
    );

    // Check if 2FA is required (most accounts)
    if ('challengeId' in response) {
      this.challengeId = response.challengeId;
      throw new CloudApiError(
        CloudApiErrorType.TWO_FACTOR_REQUIRED,
        'Two-factor authentication required. Check your email for a verification code.',
      );
    }

    // Direct authentication succeeded (rare - non-2FA account)
    if ('token' in response) {
      this.authToken = response.token;
    }
  }

  /**
   * Verify OTP code for two-factor authentication
   * Password is sent in plaintext per Dyson API requirements
   *
   * @param otpCode - One-time password from email
   * @throws {CloudApiError} If OTP verification fails
   */
  async verifyOtp(otpCode: string): Promise<void> {
    if (!this.challengeId) {
      throw new CloudApiError(
        CloudApiErrorType.AUTHENTICATION_FAILED,
        'No active 2FA challenge. Call authenticate() first.',
      );
    }

    await this.rateLimitDelay();

    // Password is sent in PLAINTEXT per Dyson API (not hashed)
    const response = await this.request<AuthResponse>(
      '/v3/userregistration/email/verify',
      {
        method: 'POST',
        body: JSON.stringify({
          email: this.email,
          password: this.password,
          challengeId: this.challengeId,
          otpCode,
        }),
        headers: {
          'Content-Type': 'application/json',
          'country': this.countryCode,
        },
      },
    );

    this.authToken = response.token;
    this.challengeId = null;
  }

  /**
   * Get list of devices from Dyson Cloud using v2 API
   * This endpoint provides LocalCredentials for MQTT authentication
   *
   * @returns Array of device info with credentials
   * @throws {CloudApiError} If not authenticated or request fails
   */
  async getDevices(): Promise<DeviceInfo[]> {
    this.ensureAuthenticated();
    await this.rateLimitDelay();

    const manifest = await this.request<RawDeviceManifestV2[]>(
      '/v2/provisioningservice/manifest',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      },
    );

    return manifest.map((device) => this.parseDeviceManifestV2(device));
  }

  /**
   * Get list of devices from Dyson Cloud using v3 API
   * This endpoint provides newer device format with localBrokerCredentials
   *
   * @param market - Market code (e.g., 'US', 'GB')
   * @param locale - Locale code (e.g., 'en-US', 'en-GB')
   * @returns Array of device info from v3 manifest
   * @throws {CloudApiError} If not authenticated or request fails
   */
  async getDevicesV3(market?: string, locale?: string): Promise<DeviceInfo[]> {
    this.ensureAuthenticated();
    await this.rateLimitDelay();

    const marketParam = market ?? this.countryCode;
    const localeParam = locale ?? `en-${this.countryCode}`;

    const manifest = await this.request<RawDeviceManifestV3[]>(
      `/v3/manifest?market=${marketParam}&locale=${localeParam}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      },
    );

    return manifest.map((device) => this.parseDeviceManifestV3(device));
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.authToken !== null;
  }

  /**
   * Get the current auth token (for external use)
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Clear authentication state
   */
  logout(): void {
    this.authToken = null;
    this.challengeId = null;
  }

  /**
   * Make authenticated request to Dyson API
   */
  private async request<T>(
    endpoint: string,
    init: RequestInit,
  ): Promise<T> {
    const url = `${DYSON_API_BASE_URL}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': 'DysonLink/212630 CFNetwork/3860.300.31 Darwin/25.2.0',
          'Accept': 'application/json',
          'Accept-Language': 'en-GB,en;q=0.9',
          'X-App-Version': '6.4.25500',
          'X-Platform': 'ios',
          ...init.headers,
        },
      });

      this.lastRequestTime = Date.now();

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as T;
      return data;
    } catch (error) {
      if (error instanceof CloudApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new CloudApiError(
          CloudApiErrorType.NETWORK_ERROR,
          `Request timeout after ${this.timeout}ms`,
        );
      }

      throw new CloudApiError(
        CloudApiErrorType.NETWORK_ERROR,
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle error responses from Dyson API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const { status } = response;

    // Try to get error message from response body
    let errorMessage = '';
    try {
      const body = await response.json() as { Message?: string };
      errorMessage = body.Message ?? '';
    } catch {
      // Ignore JSON parse errors
    }

    switch (status) {
      case 401:
        this.authToken = null;
        throw new CloudApiError(
          CloudApiErrorType.AUTHENTICATION_FAILED,
          errorMessage || 'Invalid email or password',
          status,
        );

      case 403:
        throw new CloudApiError(
          CloudApiErrorType.SESSION_EXPIRED,
          'Session expired. Please re-authenticate.',
          status,
        );

      case 404:
        throw new CloudApiError(
          CloudApiErrorType.ACCOUNT_NOT_FOUND,
          'Account not found. Check your email address.',
          status,
        );

      case 429:
        throw new CloudApiError(
          CloudApiErrorType.RATE_LIMITED,
          'Too many requests. Please try again later.',
          status,
        );

      default:
        throw new CloudApiError(
          CloudApiErrorType.NETWORK_ERROR,
          errorMessage || `HTTP error ${status}`,
          status,
        );
    }
  }

  /**
   * Ensure client is authenticated before making requests
   */
  private ensureAuthenticated(): void {
    if (!this.authToken) {
      throw new CloudApiError(
        CloudApiErrorType.AUTHENTICATION_FAILED,
        'Not authenticated. Call authenticate() first.',
      );
    }
  }

  /**
   * Decrypt LocalCredentials from device manifest
   * Uses AES-256-CBC with known key/IV
   */
  private decryptCredentials(encryptedCredentials: string): string {
    try {
      const encrypted = Buffer.from(encryptedCredentials, 'base64');
      const decipher = createDecipheriv('aes-256-cbc', DECRYPT_KEY, DECRYPT_IV);
      decipher.setAutoPadding(true);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Parse the JSON and extract the apPasswordHash
      const credentialData = JSON.parse(decrypted.toString('utf8')) as {
        apPasswordHash: string;
      };

      return credentialData.apPasswordHash;
    } catch {
      // Return empty string if decryption fails
      // Manual credential entry will be required
      return '';
    }
  }

  /**
   * Parse raw device manifest v2 into DeviceInfo
   */
  private parseDeviceManifestV2(raw: RawDeviceManifestV2): DeviceInfo {
    const deviceInfo: CloudDeviceInfo = {
      serial: raw.Serial,
      productType: raw.ProductType,
      name: raw.Name,
      version: raw.Version,
      autoUpdate: raw.AutoUpdate,
      newVersionAvailable: raw.NewVersionAvailable,
    };

    const credentials: DeviceCredentials = {
      serial: raw.Serial,
      localCredentials: this.decryptCredentials(raw.LocalCredentials),
    };

    return {
      ...deviceInfo,
      ...credentials,
    };
  }

  /**
   * Parse raw device manifest v3 into DeviceInfo
   */
  private parseDeviceManifestV3(raw: RawDeviceManifestV3): DeviceInfo {
    // Extract credentials from v3 format
    let localCredentials = '';
    if (raw.connectedConfiguration?.mqtt?.localBrokerCredentials) {
      // v3 credentials may be in a different format - try to decrypt
      localCredentials = this.decryptCredentials(
        raw.connectedConfiguration.mqtt.localBrokerCredentials,
      );
    }

    const deviceInfo: CloudDeviceInfo = {
      serial: raw.serialNumber,
      productType: raw.type,
      name: raw.name ?? raw.productName ?? 'Dyson Device',
      version: '', // v3 doesn't include version directly
      autoUpdate: raw.connectedConfiguration?.firmware?.autoUpdate ?? false,
      newVersionAvailable: false, // v3 doesn't include this
    };

    const credentials: DeviceCredentials = {
      serial: raw.serialNumber,
      localCredentials,
    };

    return {
      ...deviceInfo,
      ...credentials,
    };
  }

  /**
   * Enforce rate limiting between requests
   */
  private async rateLimitDelay(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) {
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_DELAY - elapsed),
      );
    }
  }
}
