/**
 * Dyson Cloud API Client
 * Handles authentication and device list retrieval from Dyson cloud services
 */

import { createHash, createDecipheriv } from 'node:crypto';

import type {
  AuthResponse,
  ChallengeResponse,
  CloudApiConfig,
  CloudDeviceInfo,
  DeviceCredentials,
  DeviceInfo,
  RawDeviceManifest,
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
   * May throw CloudApiError with TWO_FACTOR_REQUIRED if 2FA is needed
   *
   * @throws {CloudApiError} If authentication fails
   */
  async authenticate(): Promise<void> {
    await this.rateLimitDelay();

    const hashedPassword = this.hashPassword(this.password);

    const response = await this.request<AuthResponse | ChallengeResponse>(
      '/v3/userregistration/email/auth',
      {
        method: 'POST',
        body: JSON.stringify({
          Email: this.email,
          Password: hashedPassword,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    // Check if 2FA is required
    if ('challengeId' in response) {
      this.challengeId = response.challengeId;
      throw new CloudApiError(
        CloudApiErrorType.TWO_FACTOR_REQUIRED,
        'Two-factor authentication required. Use verifyOtp() with your OTP code.',
      );
    }

    // Store auth token
    this.authToken = response.token;
  }

  /**
   * Verify OTP code for two-factor authentication
   *
   * @param otpCode - One-time password from email/SMS
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

    const hashedPassword = this.hashPassword(this.password);

    const response = await this.request<AuthResponse>(
      '/v3/userregistration/email/verify',
      {
        method: 'POST',
        body: JSON.stringify({
          Email: this.email,
          Password: hashedPassword,
          challengeId: this.challengeId,
          otpCode,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    this.authToken = response.token;
    this.challengeId = null;
  }

  /**
   * Get list of devices from Dyson Cloud
   *
   * @returns Array of device info with credentials
   * @throws {CloudApiError} If not authenticated or request fails
   */
  async getDevices(): Promise<DeviceInfo[]> {
    this.ensureAuthenticated();
    await this.rateLimitDelay();

    const manifest = await this.request<RawDeviceManifest[]>(
      '/v2/provisioningservice/manifest',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      },
    );

    return manifest.map((device) => this.parseDeviceManifest(device));
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.authToken !== null;
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
          'User-Agent': 'DysonLink/36376 CFNetwork/1399 Darwin/22.1.0',
          'Accept': 'application/json',
          'Accept-Language': 'en-US',
          'Country': this.countryCode,
          ...init.headers,
        },
      });

      this.lastRequestTime = Date.now();

      if (!response.ok) {
        this.handleErrorResponse(response);
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
  private handleErrorResponse(response: Response): never {
    const { status } = response;

    switch (status) {
      case 401:
        this.authToken = null;
        throw new CloudApiError(
          CloudApiErrorType.AUTHENTICATION_FAILED,
          'Invalid email or password',
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
          `HTTP error ${status}`,
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
   * Hash password using SHA-512 and Base64 encoding
   * Dyson API requires this specific format
   */
  private hashPassword(password: string): string {
    const hash = createHash('sha512');
    hash.update(password, 'utf8');
    return hash.digest('base64');
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
   * Parse raw device manifest into DeviceInfo
   */
  private parseDeviceManifest(raw: RawDeviceManifest): DeviceInfo {
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
