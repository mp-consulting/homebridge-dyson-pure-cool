/**
 * Homebridge Custom UI Server
 * Handles Dyson authentication and device discovery for the wizard UI
 *
 * Authentication flow:
 * 0. GET /v1/provisioningservice/application/Android/version (IP provisioning unlock)
 * 1. POST /v3/userregistration/email/userstatus?country=XX
 * 2. POST /v3/userregistration/email/auth?country=XX&culture=en-XX
 * 3. POST /v3/userregistration/email/verify?country=XX
 *
 * Device retrieval:
 * - GET /v2/provisioningservice/manifest - Get devices with LocalCredentials
 */

import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { createDecipheriv } from 'node:crypto';
import { isIPv4 } from 'node:net';

import { getProductTypeDisplayNames, getDeviceFeatures, getHeatingDevices } from '../dist/config/index.js';
import { DysonMqttClient } from '../dist/protocol/mqttClient.js';
import { MdnsDiscovery } from '../dist/discovery/mdnsDiscovery.js';

// =============================================================================
// Constants
// =============================================================================

const DYSON_API_BASE_URL = 'https://appapi.cp.dyson.com';
const REQUEST_TIMEOUT = 15000;

const DECRYPT_KEY = Buffer.from([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
]);

const DECRYPT_IV = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const DEFAULT_HEADERS = {
  'User-Agent': 'android client',
  'Accept': 'application/json',
};

// =============================================================================
// HTTP Client (native fetch)
// =============================================================================

async function dysonRequest(endpoint, options = {}) {
  const url = `${DYSON_API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';

  console.log(`[DysonUI] ${method} ${endpoint}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    };

    const fetchOptions = {
      method,
      headers,
      signal: controller.signal,
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    const response = await fetch(url, fetchOptions);

    clearTimeout(timeoutId);

    const text = await response.text();
    // Never log the body: it carries auth tokens, challenge IDs and device credentials
    console.log(`[DysonUI] Response status: ${response.status} (${Buffer.byteLength(text ?? '', 'utf8')} bytes)`);

    if (!text?.trim()) {
      return null;
    }

    const data = JSON.parse(text);

    if (data.Message?.includes('Unable to authenticate')) {
      throw new RequestError(data.Message, { status: 401 });
    }

    if (!response.ok) {
      throw new RequestError(data.Message || `HTTP ${response.status}`, { status: response.status });
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof RequestError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw new RequestError('Request timed out', { status: 408 });
    }

    if (error.message?.includes('JSON')) {
      console.error('[DysonUI] JSON parse error:', error.message);
      throw new RequestError('Invalid response from Dyson API', { status: 500 });
    }

    console.error('[DysonUI] Fetch error:', error.message);
    throw new RequestError(`Network error: ${error.message}`, { status: 500 });
  }
}

// =============================================================================
// Input Validation
// =============================================================================

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const OTP_PATTERN = /^\d{6}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export function validateEmail(email) {
  if (typeof email !== 'string' || email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new RequestError('A valid email address is required', { status: 400 });
  }
  return email;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new RequestError('Password is required', { status: 400 });
  }
  return password;
}

export function validateOtpCode(otpCode) {
  if (typeof otpCode !== 'string' || !OTP_PATTERN.test(otpCode)) {
    throw new RequestError('Verification code must be 6 digits', { status: 400 });
  }
  return otpCode;
}

export function validateCountryCode(countryCode) {
  const normalized = typeof countryCode === 'string' ? countryCode.toUpperCase() : countryCode;
  if (typeof normalized !== 'string' || !COUNTRY_CODE_PATTERN.test(normalized)) {
    throw new RequestError('Country code must be a 2-letter ISO code', { status: 400 });
  }
  return normalized;
}

/** Optional IP from the browser: empty means "discover via mDNS", anything else must be IPv4 */
export function validateOptionalIpAddress(ipAddress) {
  if (ipAddress === undefined || ipAddress === null || ipAddress === '') {
    return undefined;
  }
  if (typeof ipAddress !== 'string' || !isIPv4(ipAddress)) {
    throw new RequestError('ipAddress must be a valid IPv4 address', { status: 400 });
  }
  return ipAddress;
}

/** True for RFC1918 private IPv4 addresses (10/8, 172.16/12, 192.168/16) */
export function isPrivateIPv4(ip) {
  if (typeof ip !== 'string' || !isIPv4(ip)) {
    return false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// =============================================================================
// Credential Decryption
// =============================================================================

function decryptCredentials(encryptedCredentials) {
  try {
    const encrypted = Buffer.from(encryptedCredentials, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', DECRYPT_KEY, DECRYPT_IV);
    decipher.setAutoPadding(true);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const data = JSON.parse(decrypted.toString('utf8'));
    return data.apPasswordHash || '';
  } catch (error) {
    console.warn('[DysonUI] Failed to decrypt device credentials:', error?.message || 'unknown error');
    return '';
  }
}

// =============================================================================
// Request Handlers
// =============================================================================

/** Drop the held password, challenge and expiry timer */
function clearPendingAuth(ctx) {
  ctx.pendingAuth = null;
  ctx.challengeId = null;
  if (ctx._pendingAuthTimer) {
    clearTimeout(ctx._pendingAuthTimer);
    ctx._pendingAuthTimer = null;
  }
}

async function handleAuthenticate(ctx, payload) {
  const email = validateEmail(payload?.email);
  const password = validatePassword(payload?.password);
  const countryCode = validateCountryCode(payload?.countryCode ?? 'US');

  // A new attempt invalidates any previous challenge
  ctx.challengeId = null;
  ctx.pendingAuth = { email, password, countryCode };

  // Clear any existing timeout and set a new one to avoid holding credentials in memory
  if (ctx._pendingAuthTimer) {
    clearTimeout(ctx._pendingAuthTimer);
  }
  ctx._pendingAuthTimer = setTimeout(() => {
    if (ctx.pendingAuth) {
      console.log('[DysonUI] Clearing stale pending auth (timeout)');
      ctx.pendingAuth = null;
      ctx.challengeId = null;
    }
    ctx._pendingAuthTimer = null;
  }, PENDING_AUTH_TIMEOUT);

  console.log(`[DysonUI] Auth: country: ${countryCode}`);

  try {
    // Step 0: Provision API (unlocks the client IP for subsequent auth calls)
    console.log('[DysonUI] Step 0: Provision API');
    await dysonRequest('/v1/provisioningservice/application/Android/version', { method: 'GET' });

    // Step 1: Check user status
    // country/culture are query params (matching the Dyson Android app); the API
    // ignores them as headers, which mints the challenge under the wrong market.
    console.log('[DysonUI] Step 1: Check user status');
    const country = encodeURIComponent(countryCode);
    const culture = encodeURIComponent(`en-${countryCode}`);
    const status = await dysonRequest(`/v3/userregistration/email/userstatus?country=${country}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (status?.accountStatus !== 'ACTIVE') {
      throw new RequestError('Account not active or not found', { status: 401 });
    }

    // Step 2: Request OTP
    console.log('[DysonUI] Step 2: Request OTP');
    const auth = await dysonRequest(`/v3/userregistration/email/auth?country=${country}&culture=${culture}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (auth?.challengeId) {
      ctx.challengeId = auth.challengeId;
      console.log('[DysonUI] 2FA required');
      return { success: true, requires2FA: true };
    }

    if (auth?.token) {
      console.log('[DysonUI] Direct auth (no 2FA)');
      clearPendingAuth(ctx);
      return { success: true, requires2FA: false, token: auth.token };
    }

    throw new RequestError('Unexpected response from Dyson', { status: 500 });
  } catch (error) {
    console.error('[DysonUI] Auth error:', error.message);
    clearPendingAuth(ctx);
    throw error;
  }
}

async function handleVerifyOtp(ctx, payload) {
  const otpCode = validateOtpCode(payload?.otpCode);

  if (!ctx.challengeId || !ctx.pendingAuth) {
    throw new RequestError('No pending authentication', { status: 400 });
  }

  const { email, password, countryCode } = ctx.pendingAuth;
  console.log('[DysonUI] Verify OTP');

  try {
    const response = await dysonRequest(`/v3/userregistration/email/verify?country=${encodeURIComponent(countryCode)}`, {
      method: 'POST',
      body: JSON.stringify({ email, password, challengeId: ctx.challengeId, otpCode }),
    });

    console.log('[DysonUI] Verify success');
    clearPendingAuth(ctx);

    return { success: true, token: response.token };
  } catch (error) {
    console.error('[DysonUI] Verify error:', error.message);

    // Keep the pending challenge so the user can retry a mistyped code; the
    // expiry timer set in handleAuthenticate still bounds how long it is held
    if (error.message?.includes('Invalid')) {
      throw new RequestError('Invalid verification code', { status: 401 });
    }

    clearPendingAuth(ctx);
    throw error;
  }
}

async function handleGetDevices(payload) {
  const { token } = payload;

  if (!token) {
    throw new RequestError('Token is required', { status: 400 });
  }

  console.log('[DysonUI] Get devices');
  const productTypes = getProductTypeDisplayNames();

  try {
    const manifest = await dysonRequest('/v2/provisioningservice/manifest', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`[DysonUI] Found ${manifest?.length || 0} devices`);

    const devices = (manifest || []).map((d) => {
      // Support both v2 field names (Serial, ProductType, etc.) and
      // v3 field names (serialNumber, type, etc.) for API compatibility
      const serial = d.Serial || d.serialNumber;
      const productType = d.ProductType || d.type;
      const name = d.Name || d.name || d.productName;
      const version = d.Version || '';
      const autoUpdate = d.AutoUpdate ?? d.connectedConfiguration?.firmware?.autoUpdate ?? false;
      const newVersionAvailable = d.NewVersionAvailable ?? false;

      // Credentials: v2 uses LocalCredentials, v3 uses connectedConfiguration.mqtt.localBrokerCredentials
      const rawCredentials = d.LocalCredentials || d.connectedConfiguration?.mqtt?.localBrokerCredentials || '';

      const features = getDeviceFeatures(productType);
      return {
        serial,
        name,
        productType,
        productName: productTypes[productType] || `Unknown (${productType})`,
        version,
        localCredentials: rawCredentials ? decryptCredentials(rawCredentials) : '',
        autoUpdate,
        newVersionAvailable,
        // Expose device capabilities from catalog
        hasHeating: features.heating,
        hasHumidifier: features.humidifier,
        hasOscillation: features.oscillation,
        hasJetFocus: features.frontAirflow,
      };
    });

    return { success: true, devices };
  } catch (error) {
    console.error('[DysonUI] Get devices error:', error.message);
    if (error.status === 401 || error.status === 403) {
      throw new RequestError('Session expired', { status: 401 });
    }
    throw error;
  }
}

async function handleGetProductTypes() {
  const productTypeNames = getProductTypeDisplayNames();
  const heatingProductTypes = getHeatingDevices().map((d) => d.productType);
  const jetFocusProductTypes = Object.keys(productTypeNames).filter((pt) => getDeviceFeatures(pt)?.frontAirflow === true);
  return {
    success: true,
    productTypes: productTypeNames,
    heatingProductTypes,
    jetFocusProductTypes,
  };
}

// =============================================================================
// Device MQTT Communication
// =============================================================================

/** MQTT connection timeout */
const MQTT_TIMEOUT = 10000;

/** mDNS discovery timeout */
const MDNS_TIMEOUT = 5000;

/**
 * Get device IP - uses config IP first, falls back to mDNS discovery
 * @param {object} ctx - Server context with access to config
 * @param {string} serial - Device serial number
 * @param {string} [configIp] - IP address from config (if available)
 * @param {string} [previousIp] - Cached/configured IP, used to warn when mDNS reports a different one
 * @returns {Promise<{ip: string, discovered: boolean}>} IP and whether it was discovered
 */
async function getDeviceIp(_ctx, serial, configIp, previousIp) {
  // Try config IP first if provided
  if (configIp) {
    console.log(`[DysonUI] Using cached IP for ${serial}`);
    return { ip: configIp, discovered: false };
  }

  // Fall back to mDNS discovery
  console.log(`[DysonUI] Discovering device ${serial} via mDNS...`);
  const discovery = new MdnsDiscovery();

  try {
    const devices = await discovery.discover({ timeout: MDNS_TIMEOUT });
    console.log(`[DysonUI] mDNS found ${devices.size} devices`);

    const ip = devices.get(serial);
    if (ip) {
      // mDNS answers are unauthenticated: never point MQTT (and the device
      // credentials) at anything outside the private LAN ranges
      if (!isPrivateIPv4(ip)) {
        console.warn(`[DysonUI] Ignoring mDNS address for ${serial}: not a private IPv4 address`);
        return { ip: null, discovered: false };
      }
      if (previousIp && ip !== previousIp) {
        console.warn(`[DysonUI] mDNS-discovered IP for ${serial} differs from the cached/configured IP`);
      }
      return { ip, discovered: true };
    }

    return { ip: null, discovered: false };
  } catch (error) {
    console.error('[DysonUI] mDNS discovery error:', error.message);
    return { ip: null, discovered: false };
  }
}


/**
 * Get device state via MQTT
 */
async function handleGetDeviceState(ctx, payload) {
  const { serial, productType, localCredentials } = payload;
  const ipAddress = validateOptionalIpAddress(payload.ipAddress);

  if (!serial || !productType || !localCredentials) {
    throw new RequestError('Missing device info (serial, productType, localCredentials)', { status: 400 });
  }

  // Get device IP - use config IP first, fall back to mDNS
  const { ip, discovered } = await getDeviceIp(ctx, serial, ipAddress);

  // If config IP fails, try mDNS discovery
  if (!ip) {
    throw new RequestError(`Device ${serial} not found on network`, { status: 404 });
  }

  console.log(`[DysonUI] Connecting to ${serial}`);

  const client = new DysonMqttClient({
    host: ip,
    serial,
    credentials: localCredentials,
    productType,
    timeout: MQTT_TIMEOUT,
    autoReconnect: false,
  });

  try {
    await client.connect();
    await client.subscribeToStatus();

    // Request current state and wait for response
    const state = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for device state'));
      }, MQTT_TIMEOUT);

      client.on('message', (msg) => {
        if (msg.data?.msg === 'CURRENT-STATE') {
          clearTimeout(timeout);
          resolve(msg.data);
        }
      });

      client.requestCurrentState().catch(reject);
    });

    await client.disconnect();

    // Parse continuous monitoring state from rhtm field
    const continuousMonitoring = state['product-state']?.rhtm === 'ON';

    console.log(`[DysonUI] Device state: continuousMonitoring=${continuousMonitoring}`);

    // Return discovered IP so client can save it to config
    return {
      success: true,
      continuousMonitoring,
      // A retry after mDNS rediscovery passes the new IP in as if cached;
      // still report it so the wizard saves it
      discoveredIp: discovered || payload._retried ? ip : undefined,
    };
  } catch (error) {
    console.error('[DysonUI] MQTT error:', error.message);
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // If connection failed with cached IP, try mDNS discovery (but only once)
    if (ipAddress && !discovered && !payload._retried) {
      console.log('[DysonUI] Cached IP failed, trying mDNS discovery...');
      const freshResult = await getDeviceIp(ctx, serial, null, ipAddress);
      if (freshResult.ip && freshResult.ip !== ipAddress) {
        // Retry with freshly discovered IP
        return handleGetDeviceState(ctx, { ...payload, ipAddress: freshResult.ip, _retried: true });
      }
    }

    throw new RequestError(`Failed to get device state: ${error.message}`, { status: 500 });
  }
}

/**
 * Set continuous monitoring via MQTT
 */
async function handleSetContinuousMonitoring(ctx, payload) {
  const { serial, productType, localCredentials, enabled } = payload;
  const ipAddress = validateOptionalIpAddress(payload.ipAddress);

  if (!serial || !productType || !localCredentials) {
    throw new RequestError('Missing device info (serial, productType, localCredentials)', { status: 400 });
  }

  if (typeof enabled !== 'boolean') {
    throw new RequestError('enabled must be a boolean', { status: 400 });
  }

  // Get device IP - use config IP first, fall back to mDNS
  const { ip, discovered } = await getDeviceIp(ctx, serial, ipAddress);
  if (!ip) {
    throw new RequestError(`Device ${serial} not found on network`, { status: 404 });
  }

  console.log(`[DysonUI] Setting continuous monitoring to ${enabled} for ${serial}`);

  const client = new DysonMqttClient({
    host: ip,
    serial,
    credentials: localCredentials,
    productType,
    timeout: MQTT_TIMEOUT,
    autoReconnect: false,
  });

  try {
    await client.connect();

    // Send STATE-SET command
    const command = {
      msg: 'STATE-SET',
      time: new Date().toISOString(),
      'mode-reason': 'LAPP',
      data: {
        rhtm: enabled ? 'ON' : 'OFF',
      },
    };

    await client.publishCommand(command);
    await client.disconnect();

    console.log(`[DysonUI] Continuous monitoring set to ${enabled}`);

    // Return discovered IP so client can save it to config
    return {
      success: true,
      continuousMonitoring: enabled,
      // A retry after mDNS rediscovery passes the new IP in as if cached;
      // still report it so the wizard saves it
      discoveredIp: discovered || payload._retried ? ip : undefined,
    };
  } catch (error) {
    console.error('[DysonUI] MQTT error:', error.message);
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // If connection failed with cached IP, try mDNS discovery (but only once)
    if (ipAddress && !discovered && !payload._retried) {
      console.log('[DysonUI] Cached IP failed, trying mDNS discovery...');
      const freshResult = await getDeviceIp(ctx, serial, null, ipAddress);
      if (freshResult.ip && freshResult.ip !== ipAddress) {
        // Retry with freshly discovered IP
        return handleSetContinuousMonitoring(ctx, { ...payload, ipAddress: freshResult.ip, _retried: true });
      }
    }

    throw new RequestError(`Failed to set continuous monitoring: ${error.message}`, { status: 500 });
  }
}

// =============================================================================
// Server
// =============================================================================

/** Timeout to clear pending auth (10 minutes) */
const PENDING_AUTH_TIMEOUT = 10 * 60 * 1000;

class DysonUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.challengeId = null;
    this.pendingAuth = null;
    this._pendingAuthTimer = null;

    this.onRequest('/authenticate', (p) => handleAuthenticate(this, p));
    this.onRequest('/verify-otp', (p) => handleVerifyOtp(this, p));
    this.onRequest('/get-devices', handleGetDevices);
    this.onRequest('/get-product-types', handleGetProductTypes);
    this.onRequest('/get-device-state', (p) => handleGetDeviceState(this, p));
    this.onRequest('/set-continuous-monitoring', (p) => handleSetContinuousMonitoring(this, p));

    this.ready();
  }
}

(() => new DysonUiServer())();
