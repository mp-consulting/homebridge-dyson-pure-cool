/**
 * Discovery Layer Types
 * Types for device discovery via Dyson Cloud API and mDNS
 */

/**
 * Device information retrieved from Dyson Cloud API
 */
export interface CloudDeviceInfo {
  /** Device serial number (unique identifier) */
  serial: string;
  /** Product type code (e.g., '438' for TP04) */
  productType: string;
  /** User-assigned device name */
  name: string;
  /** Firmware version */
  version: string;
  /** Whether device auto-updates firmware */
  autoUpdate: boolean;
  /** Whether new firmware is available */
  newVersionAvailable: boolean;
}

/**
 * Device credentials for local MQTT connection
 */
export interface DeviceCredentials {
  /** Device serial number */
  serial: string;
  /** Local MQTT password (decrypted) */
  localCredentials: string;
}

/**
 * Combined device info with credentials for connection
 */
export interface DeviceInfo extends CloudDeviceInfo, DeviceCredentials {
  /** Discovered IP address (from mDNS) */
  ipAddress?: string;
}

/**
 * Authentication response from Dyson Cloud API
 */
export interface AuthResponse {
  /** Account identifier */
  account: string;
  /** Authentication token */
  token: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
}

/**
 * Challenge response for 2FA authentication
 */
export interface ChallengeResponse {
  /** Challenge ID for OTP verification */
  challengeId: string;
}

/**
 * Raw device manifest from Dyson Cloud API
 */
export interface RawDeviceManifest {
  Serial: string;
  Name: string;
  ProductType: string;
  Version: string;
  LocalCredentials: string;
  AutoUpdate: boolean;
  NewVersionAvailable: boolean;
}

/**
 * Cloud API configuration options
 */
export interface CloudApiConfig {
  /** Dyson account email */
  email: string;
  /** Dyson account password */
  password: string;
  /** Country code (e.g., 'US', 'GB') */
  countryCode?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Error types for Cloud API operations
 */
export enum CloudApiErrorType {
  /** Invalid email or password */
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  /** Two-factor authentication required */
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  /** Invalid OTP code */
  INVALID_OTP = 'INVALID_OTP',
  /** Too many requests - rate limited */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Network or server error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Account not found */
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  /** Session expired */
  SESSION_EXPIRED = 'SESSION_EXPIRED',
}

/**
 * Custom error class for Cloud API errors
 */
export class CloudApiError extends Error {
  constructor(
    public readonly type: CloudApiErrorType,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'CloudApiError';
  }
}
