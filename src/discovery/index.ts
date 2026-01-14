/**
 * Discovery Layer
 * Device discovery via Dyson Cloud API and mDNS
 */

export { DysonCloudApi } from './cloudApi.js';
export { MdnsDiscovery } from './mdnsDiscovery.js';
export type {
  DiscoveredDevice,
  DiscoveryOptions,
} from './mdnsDiscovery.js';
export type {
  AuthResponse,
  ChallengeResponse,
  CloudApiConfig,
  CloudDeviceInfo,
  DeviceCredentials,
  DeviceInfo,
  RawDeviceManifest,
} from './types.js';
export { CloudApiError, CloudApiErrorType } from './types.js';
