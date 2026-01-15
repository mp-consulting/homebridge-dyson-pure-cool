/**
 * Homebridge Custom UI Server
 * Handles Dyson authentication and device discovery for the wizard UI
 *
 * Authentication flow (from Android app v6.4.25500 analysis 2026-01-15):
 * 1. POST /v3/userregistration/email/userstatus (header: country)
 * 2. POST /v3/userregistration/email/auth (headers: country, culture)
 * 3. POST /v3/userregistration/email/verify (header: country)
 *
 * Device retrieval:
 * - GET /v2/provisioningservice/manifest - Get devices with LocalCredentials
 */

import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { createDecipheriv } from 'node:crypto';
import { execSync } from 'node:child_process';

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
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 14)',
  'Accept': 'application/json',
  'Accept-Language': 'en-GB,en;q=0.9',
  'X-App-Version': '6.4.25500',
  'X-Platform': 'android',
};

// =============================================================================
// HTTP Client (curl-based)
// =============================================================================

function dysonRequest(endpoint, options = {}) {
  const url = `${DYSON_API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';

  console.log(`[DysonUI] ${method} ${endpoint}`);

  const curlArgs = buildCurlCommand(url, method, options);
  const shellCmd = escapeForShell(curlArgs);

  return executeCurl(shellCmd, options.body);
}

function buildCurlCommand(url, method, options) {
  const args = ['curl', '-s', '-X', method, '-H', 'Content-Type: application/json'];

  // Add default headers
  for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
    args.push('-H', `${key}: ${value}`);
  }

  // Add custom headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      args.push('-H', `${key}: ${value}`);
    }
  }

  // Add body
  if (options.body) {
    args.push('-d', options.body);
  }

  args.push(url);
  return args;
}

function escapeForShell(args) {
  return args.map((arg) => {
    if (arg.startsWith('-')) return arg;
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }).join(' ');
}

function executeCurl(shellCmd, body) {
  if (body) {
    console.log(`[DysonUI] Body: ${body}`);
  }

  try {
    const output = execSync(shellCmd, {
      encoding: 'utf8',
      timeout: REQUEST_TIMEOUT,
      maxBuffer: 1024 * 1024,
    });

    console.log(`[DysonUI] Response: ${output.substring(0, 200)}`);

    if (!output?.trim()) return null;

    const data = JSON.parse(output);

    if (data.Message?.includes('Unable to authenticate')) {
      throw new RequestError(data.Message, { status: 401 });
    }

    return data;
  } catch (error) {
    handleCurlError(error);
  }
}

function handleCurlError(error) {
  if (error instanceof RequestError) throw error;

  if (error.message?.includes('JSON')) {
    console.error('[DysonUI] JSON parse error:', error.message);
    throw new RequestError('Invalid response from Dyson API', { status: 500 });
  }

  if (error.killed) {
    throw new RequestError('Request timed out', { status: 408 });
  }

  console.error('[DysonUI] Curl error:', error.message);
  throw new RequestError(`Network error: ${error.message}`, { status: 500 });
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
  } catch {
    return '';
  }
}

// =============================================================================
// Request Handlers
// =============================================================================

async function handleAuthenticate(ctx, payload) {
  const { email, password, countryCode = 'US' } = payload;

  if (!email || !password) {
    throw new RequestError('Email and password are required', { status: 400 });
  }

  ctx.pendingAuth = { email, password, countryCode };
  console.log(`[DysonUI] Auth: ${email}, country: ${countryCode}`);

  try {
    // Step 1: Check user status
    console.log('[DysonUI] Step 1: Check user status');
    const status = await dysonRequest('/v3/userregistration/email/userstatus', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: { country: countryCode },
    });

    if (status?.accountStatus !== 'ACTIVE') {
      throw new RequestError('Account not active or not found', { status: 401 });
    }

    // Step 2: Request OTP
    console.log('[DysonUI] Step 2: Request OTP');
    const auth = await dysonRequest('/v3/userregistration/email/auth', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: { country: countryCode, culture: `en-${countryCode}` },
    });

    if (auth?.challengeId) {
      ctx.challengeId = auth.challengeId;
      console.log('[DysonUI] 2FA required');
      return { success: true, requires2FA: true };
    }

    if (auth?.token) {
      console.log('[DysonUI] Direct auth (no 2FA)');
      ctx.pendingAuth = null;
      return { success: true, requires2FA: false, token: auth.token };
    }

    throw new RequestError('Unexpected response from Dyson', { status: 500 });
  } catch (error) {
    console.error('[DysonUI] Auth error:', error.message);
    if (!(error instanceof RequestError)) ctx.pendingAuth = null;
    throw error;
  }
}

async function handleVerifyOtp(ctx, payload) {
  const { otpCode } = payload;

  if (!otpCode) {
    throw new RequestError('OTP code is required', { status: 400 });
  }

  if (!ctx.challengeId || !ctx.pendingAuth) {
    throw new RequestError('No pending authentication', { status: 400 });
  }

  const { email, password, countryCode } = ctx.pendingAuth;
  console.log('[DysonUI] Verify OTP');

  try {
    const response = await dysonRequest('/v3/userregistration/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, password, challengeId: ctx.challengeId, otpCode }),
      headers: { country: countryCode },
    });

    console.log('[DysonUI] Verify success');
    ctx.pendingAuth = null;
    ctx.challengeId = null;

    return { success: true, token: response.token };
  } catch (error) {
    console.error('[DysonUI] Verify error:', error.message);

    if (error.message?.includes('Invalid')) {
      throw new RequestError('Invalid verification code', { status: 401 });
    }

    ctx.pendingAuth = null;
    ctx.challengeId = null;
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
      const features = getDeviceFeatures(d.ProductType);
      return {
        serial: d.Serial,
        name: d.Name,
        productType: d.ProductType,
        productName: productTypes[d.ProductType] || `Unknown (${d.ProductType})`,
        version: d.Version,
        localCredentials: decryptCredentials(d.LocalCredentials),
        autoUpdate: d.AutoUpdate,
        newVersionAvailable: d.NewVersionAvailable,
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
  // Get product types with heating capability
  const heatingProductTypes = getHeatingDevices().map((d) => d.productType);
  return {
    success: true,
    productTypes: getProductTypeDisplayNames(),
    heatingProductTypes,
  };
}

// =============================================================================
// Device MQTT Communication
// =============================================================================

/** Cache discovered device IPs (serial -> IP) */
const deviceIpCache = new Map();

/** MQTT connection timeout */
const MQTT_TIMEOUT = 10000;

/** mDNS discovery timeout */
const MDNS_TIMEOUT = 5000;

/**
 * Discover device IP via mDNS
 */
async function discoverDeviceIp(serial) {
  // Check cache first
  if (deviceIpCache.has(serial)) {
    return deviceIpCache.get(serial);
  }

  console.log(`[DysonUI] Discovering device ${serial} via mDNS...`);
  const discovery = new MdnsDiscovery();

  try {
    const devices = await discovery.discover({ timeout: MDNS_TIMEOUT });
    console.log(`[DysonUI] mDNS found ${devices.size} devices`);

    // Cache all discovered devices
    for (const [discoveredSerial, ip] of devices) {
      deviceIpCache.set(discoveredSerial, ip);
    }

    return devices.get(serial) || null;
  } catch (error) {
    console.error('[DysonUI] mDNS discovery error:', error.message);
    return null;
  }
}

/**
 * Get device state via MQTT
 */
async function handleGetDeviceState(payload) {
  const { serial, productType, localCredentials } = payload;

  if (!serial || !productType || !localCredentials) {
    throw new RequestError('Missing device info (serial, productType, localCredentials)', { status: 400 });
  }

  // Discover device IP
  const ip = await discoverDeviceIp(serial);
  if (!ip) {
    throw new RequestError(`Device ${serial} not found on network`, { status: 404 });
  }

  console.log(`[DysonUI] Connecting to ${serial} at ${ip}`);

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

    return {
      success: true,
      continuousMonitoring,
      rawState: state['product-state'],
    };
  } catch (error) {
    console.error('[DysonUI] MQTT error:', error.message);
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    throw new RequestError(`Failed to get device state: ${error.message}`, { status: 500 });
  }
}

/**
 * Set continuous monitoring via MQTT
 */
async function handleSetContinuousMonitoring(payload) {
  const { serial, productType, localCredentials, enabled } = payload;

  if (!serial || !productType || !localCredentials) {
    throw new RequestError('Missing device info (serial, productType, localCredentials)', { status: 400 });
  }

  if (typeof enabled !== 'boolean') {
    throw new RequestError('enabled must be a boolean', { status: 400 });
  }

  // Discover device IP
  const ip = await discoverDeviceIp(serial);
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

    return { success: true, continuousMonitoring: enabled };
  } catch (error) {
    console.error('[DysonUI] MQTT error:', error.message);
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    throw new RequestError(`Failed to set continuous monitoring: ${error.message}`, { status: 500 });
  }
}

// =============================================================================
// Server
// =============================================================================

class DysonUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.challengeId = null;
    this.pendingAuth = null;

    this.onRequest('/authenticate', (p) => handleAuthenticate(this, p));
    this.onRequest('/verify-otp', (p) => handleVerifyOtp(this, p));
    this.onRequest('/get-devices', handleGetDevices);
    this.onRequest('/get-product-types', handleGetProductTypes);
    this.onRequest('/get-device-state', handleGetDeviceState);
    this.onRequest('/set-continuous-monitoring', handleSetContinuousMonitoring);

    this.ready();
  }
}

(() => new DysonUiServer())();
