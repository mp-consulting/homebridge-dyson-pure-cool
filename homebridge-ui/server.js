/**
 * Homebridge Custom UI Server
 * Handles Dyson authentication and device discovery for the wizard UI
 *
 * Authentication flow (from iOS app capture 2026-01-13):
 * 1. POST /v3/userregistration/email/userstatus?country=XX
 *    - Check account status and auth method
 * 2. POST /v3/userregistration/email/auth?country=XX&culture=en-XX
 *    - Initiate auth (sends OTP email for 2FA accounts)
 * 3. POST /v3/userregistration/email/verify?country=XX
 *    - Verify OTP and get token (password sent in plaintext here)
 */

import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { createDecipheriv } from 'node:crypto';
import { execSync } from 'node:child_process';

/** Dyson Cloud API base URL */
const DYSON_API_BASE_URL = 'https://appapi.cp.dyson.com';

/** Request timeout (15 seconds) */
const TIMEOUT = 15000;

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

/** Product type codes mapped to friendly names */
const PRODUCT_TYPES = {
  '438': 'Dyson Pure Cool Tower (TP04)',
  '438E': 'Dyson Pure Cool Tower (TP07)',
  '438K': 'Dyson Pure Cool Tower Formaldehyde (TP09)',
  '520': 'Dyson Pure Cool Desk (DP04)',
  '527': 'Dyson Pure Hot+Cool (HP04)',
  '527E': 'Dyson Pure Hot+Cool (HP07)',
  '527K': 'Dyson Pure Hot+Cool Formaldehyde (HP09)',
  '455': 'Dyson Pure Hot+Cool Link (HP02)',
  '469': 'Dyson Pure Cool Link Desk (DP01)',
  '475': 'Dyson Pure Cool Link Tower (TP02)',
  '664': 'Dyson Purifier Big+Quiet Formaldehyde (BP03)',
  '664E': 'Dyson Purifier Big+Quiet Formaldehyde (BP04)',
};

class DysonUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Store auth data for 2FA flow
    this.challengeId = null;
    this.pendingEmail = null;
    this.pendingPassword = null;
    this.pendingCountryCode = null;
    this.authenticationMethod = null;

    // Register API endpoints
    this.onRequest('/authenticate', this.handleAuthenticate.bind(this));
    this.onRequest('/verify-otp', this.handleVerifyOtp.bind(this));
    this.onRequest('/get-devices', this.handleGetDevices.bind(this));

    // Mark as ready
    this.ready();
  }

  /**
   * Handle initial authentication request
   * Flow:
   * 1. Check user status to get auth method
   * 2. Initiate auth (sends OTP for 2FA accounts)
   */
  async handleAuthenticate(payload) {
    const { email, password, countryCode = 'US' } = payload;

    if (!email || !password) {
      throw new RequestError('Email and password are required', { status: 400 });
    }

    // Store credentials for the verify step
    this.pendingEmail = email;
    this.pendingPassword = password;
    this.pendingCountryCode = countryCode;

    try {
      console.log(`[DysonUI] Authenticating user: ${email}, country: ${countryCode}`);

      // Step 1: Check user status
      console.log('[DysonUI] Step 1: Checking user status...');
      const statusResponse = await this.dysonRequest(
        `/v3/userregistration/email/userstatus?country=${countryCode}`,
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );

      console.log('[DysonUI] User status response:', JSON.stringify(statusResponse));

      if (!statusResponse || statusResponse.accountStatus !== 'ACTIVE') {
        throw new RequestError('Account not active or not found. Please check your email address.', { status: 401 });
      }

      this.authenticationMethod = statusResponse.authenticationMethod;

      // Step 2: Initiate auth (sends OTP for EMAIL_PWD_2FA accounts)
      console.log('[DysonUI] Step 2: Initiating auth...');
      const authResponse = await this.dysonRequest(
        `/v3/userregistration/email/auth?country=${countryCode}&culture=en-${countryCode}`,
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );

      console.log('[DysonUI] Auth response:', JSON.stringify(authResponse));

      // Check if 2FA is required (challengeId present means OTP was sent)
      if (authResponse && authResponse.challengeId) {
        this.challengeId = authResponse.challengeId;
        console.log('[DysonUI] 2FA required, OTP email sent');
        return {
          success: true,
          requires2FA: true,
          message: 'Check your email for a verification code',
        };
      }

      // Direct authentication succeeded (token present) - non-2FA account
      if (authResponse && authResponse.token) {
        console.log('[DysonUI] Direct auth succeeded (no 2FA)');
        this.clearPendingAuth();
        return {
          success: true,
          requires2FA: false,
          token: authResponse.token,
        };
      }

      // Unexpected response format
      console.error('[DysonUI] Unexpected auth response format:', JSON.stringify(authResponse));
      throw new RequestError('Unexpected response from Dyson. Please try again.', { status: 500 });
    } catch (error) {
      console.error('[DysonUI] Auth error:', error.message);
      if (!(error instanceof RequestError)) {
        this.clearPendingAuth();
      }
      throw error;
    }
  }

  /**
   * Handle OTP verification for 2FA
   * The password is sent in plaintext (not hashed) per Dyson API requirements
   */
  async handleVerifyOtp(payload) {
    const { otpCode } = payload;

    if (!otpCode) {
      throw new RequestError('OTP code is required', { status: 400 });
    }

    if (!this.challengeId || !this.pendingEmail || !this.pendingPassword) {
      throw new RequestError('No pending authentication. Please start over.', { status: 400 });
    }

    try {
      console.log('[DysonUI] Verifying OTP...');

      // Password is sent in PLAINTEXT per Dyson API (not hashed)
      const response = await this.dysonRequest(
        `/v3/userregistration/email/verify?country=${this.pendingCountryCode}`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: this.pendingEmail,
            password: this.pendingPassword,
            challengeId: this.challengeId,
            otpCode: otpCode,
          }),
        }
      );

      console.log('[DysonUI] Verify response keys:', response ? Object.keys(response) : 'null');

      // Clear pending auth data on success
      this.clearPendingAuth();

      return {
        success: true,
        token: response.token,
      };
    } catch (error) {
      console.error('[DysonUI] Verify error:', error.message);
      // Don't clear on invalid OTP - let user retry
      if (error.message && error.message.includes('Invalid')) {
        throw new RequestError('Invalid verification code. Please try again.', { status: 401 });
      }
      this.clearPendingAuth();
      throw error;
    }
  }

  /**
   * Handle device list retrieval
   */
  async handleGetDevices(payload) {
    const { token } = payload;

    if (!token) {
      throw new RequestError('Authentication token is required', { status: 400 });
    }

    try {
      console.log('[DysonUI] Fetching device manifest...');

      const manifest = await this.dysonRequest('/v2/provisioningservice/manifest', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('[DysonUI] Got manifest with', Array.isArray(manifest) ? manifest.length : 0, 'devices');

      // Parse and return device list
      const devices = manifest.map((device) => ({
        serial: device.Serial,
        name: device.Name,
        productType: device.ProductType,
        productName: PRODUCT_TYPES[device.ProductType] || `Unknown (${device.ProductType})`,
        version: device.Version,
        localCredentials: this.decryptCredentials(device.LocalCredentials),
        autoUpdate: device.AutoUpdate,
        newVersionAvailable: device.NewVersionAvailable,
      }));

      return {
        success: true,
        devices,
      };
    } catch (error) {
      console.error('[DysonUI] Get devices error:', error.message);
      if (error.status === 401 || error.status === 403) {
        throw new RequestError('Session expired. Please authenticate again.', { status: 401 });
      }
      throw error;
    }
  }

  /**
   * Make request to Dyson API using curl
   * Using curl because Node.js fetch gets blocked by Dyson's API
   */
  async dysonRequest(endpoint, options) {
    const url = `${DYSON_API_BASE_URL}${endpoint}`;
    const method = options.method || 'GET';

    console.log(`[DysonUI] Request: ${method} ${endpoint}`);

    // Build curl command
    const curlArgs = [
      'curl',
      '-s', // silent
      '-X', method,
      '-H', 'Content-Type: application/json',
      '-H', 'User-Agent: DysonLink/212630 CFNetwork/3860.300.31 Darwin/25.2.0',
      '-H', 'Accept: application/json',
      '-H', 'Accept-Language: en-GB,en;q=0.9',
      '-H', 'X-App-Version: 6.4.25500',
      '-H', 'X-Platform: ios',
    ];

    // Add Authorization header if present
    if (options.headers && options.headers.Authorization) {
      curlArgs.push('-H', `Authorization: ${options.headers.Authorization}`);
    }

    // Add body for POST requests
    if (options.body) {
      curlArgs.push('-d', options.body);
      console.log(`[DysonUI] Request body: ${options.body}`);
    }

    // Add URL (must be last)
    curlArgs.push(url);

    // Build shell command with proper escaping
    const shellCmd = curlArgs.map((arg, i) => {
      // Don't quote flags
      if (arg.startsWith('-')) return arg;
      // Quote everything else
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }).join(' ');

    console.log(`[DysonUI] Curl command: ${shellCmd.substring(0, 200)}...`);

    try {
      const output = execSync(shellCmd, {
        encoding: 'utf8',
        timeout: TIMEOUT,
        maxBuffer: 1024 * 1024,
      });

      console.log(`[DysonUI] Response: ${output.substring(0, 200)}`);

      if (!output || output.trim() === '') {
        return null;
      }

      const data = JSON.parse(output);

      // Check for error in response
      if (data.Message && data.Message.includes('Unable to authenticate')) {
        throw new RequestError(data.Message, { status: 401 });
      }

      return data;
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }

      // Check if it's a JSON parse error with error content
      if (error.message && error.message.includes('JSON')) {
        console.error('[DysonUI] Failed to parse response:', error.message);
        throw new RequestError('Invalid response from Dyson API', { status: 500 });
      }

      // Check for timeout
      if (error.killed) {
        throw new RequestError('Request timed out. Please try again.', { status: 408 });
      }

      console.error('[DysonUI] Curl error:', error.message);
      throw new RequestError(`Network error: ${error.message}`, { status: 500 });
    }
  }

  /**
   * Decrypt LocalCredentials from device manifest
   */
  decryptCredentials(encryptedCredentials) {
    try {
      const encrypted = Buffer.from(encryptedCredentials, 'base64');
      const decipher = createDecipheriv('aes-256-cbc', DECRYPT_KEY, DECRYPT_IV);
      decipher.setAutoPadding(true);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const credentialData = JSON.parse(decrypted.toString('utf8'));
      return credentialData.apPasswordHash || '';
    } catch {
      return '';
    }
  }

  /**
   * Clear pending authentication data
   */
  clearPendingAuth() {
    this.challengeId = null;
    this.pendingEmail = null;
    this.pendingPassword = null;
    this.pendingCountryCode = null;
    this.authenticationMethod = null;
  }
}

// Initialize server
(() => new DysonUiServer())();
