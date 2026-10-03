/**
 * mDNS Discovery for Dyson Devices
 * Discovers Dyson devices on the local network via mDNS/Bonjour
 */

import { isIPv4, isIPv6 } from 'node:net';

import { Bonjour, type Browser, type Service } from 'bonjour-service';

import { DYSON_MDNS_SERVICE } from '../config/index.js';

/** Default discovery timeout in milliseconds */
export const DEFAULT_DISCOVERY_TIMEOUT = 10000;

/** Minimum timeout allowed */
const MIN_TIMEOUT = 1000;

/** Maximum timeout allowed */
const MAX_TIMEOUT = 60000;

/**
 * Whether an address belongs to the local network: RFC 1918 private IPv4,
 * or IPv6 link-local (fe80::/10) / unique-local (fc00::/7).
 *
 * @internal exported for tests
 */
export function isLocalNetworkAddress(address: string): boolean {
  if (isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  if (isIPv6(address)) {
    const lower = address.toLowerCase();
    return /^fe[89ab]/.test(lower) || /^f[cd]/.test(lower);
  }
  return false;
}

/**
 * Discovery result containing device serial and IP address
 */
export interface DiscoveredDevice {
  /** Device serial number extracted from mDNS name */
  serial: string;
  /** Device IP address (IPv4 preferred) */
  ipAddress: string;
  /** Device hostname */
  hostname: string;
  /** mDNS service port */
  port: number;
}

/**
 * Options for mDNS discovery
 */
export interface DiscoveryOptions {
  /** Discovery timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Stop after finding this many devices (0 = find all) */
  maxDevices?: number;
}

/** Bonjour factory type for dependency injection */
export type BonjourFactory = () => Bonjour;

/** Default Bonjour factory */
const defaultBonjourFactory: BonjourFactory = () => new Bonjour();

/**
 * mDNS Discovery for Dyson devices
 * Discovers devices advertising the _dyson_mqtt._tcp service
 *
 * @example
 * ```typescript
 * const discovery = new MdnsDiscovery();
 * const devices = await discovery.discover();
 * // devices is Map<serial, ipAddress>
 * ```
 */
export class MdnsDiscovery {
  private bonjour: Bonjour | null = null;
  private browser: Browser | null = null;
  private readonly bonjourFactory: BonjourFactory;

  constructor(bonjourFactory: BonjourFactory = defaultBonjourFactory) {
    this.bonjourFactory = bonjourFactory;
  }

  /**
   * Discover Dyson devices on the local network
   *
   * @param options - Discovery options
   * @returns Map of device serial numbers to IP addresses
   */
  async discover(options: DiscoveryOptions = {}): Promise<Map<string, string>> {
    const devices = await this.discoverDetailed(options);
    return new Map(devices.map((device) => [device.serial, device.ipAddress]));
  }

  /**
   * Discover devices and return detailed information
   *
   * @param options - Discovery options
   * @returns Array of discovered device details
   */
  async discoverDetailed(options: DiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    const timeout = this.validateTimeout(options.timeout ?? DEFAULT_DISCOVERY_TIMEOUT);
    const maxDevices = options.maxDevices ?? 0;

    const devices: DiscoveredDevice[] = [];

    return new Promise((resolve) => {
      let resolved = false;
      this.bonjour = this.bonjourFactory();

      const serviceType = DYSON_MDNS_SERVICE.replace('_', '').replace('._tcp', '');

      this.browser = this.bonjour.find({ type: serviceType });

      // Set timeout to stop discovery (unref to avoid keeping the process alive)
      const detailedTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.cleanup();
          resolve(devices);
        }
      }, timeout);
      detailedTimeout.unref();

      this.browser.on('up', (service: Service) => {
        const device = this.parseService(service);
        if (device) {
          // Avoid duplicates
          if (!devices.some((d) => d.serial === device.serial)) {
            devices.push(device);
          }

          // Stop early if we found enough devices
          if (maxDevices > 0 && devices.length >= maxDevices && !resolved) {
            resolved = true;
            clearTimeout(detailedTimeout);
            this.cleanup();
            resolve(devices);
          }
        }
      });
    });
  }

  /**
   * Stop any ongoing discovery
   */
  stop(): void {
    this.cleanup();
  }

  /**
   * Parse mDNS service into device info
   * Service name format: {serial}_dyson_mqtt._tcp.local
   */
  private parseService(service: Service): DiscoveredDevice | null {
    // Extract serial from service name
    // Format: "ABC-XX-12345678_dyson_mqtt" or just "ABC-XX-12345678"
    const serial = this.extractSerial(service.name);
    if (!serial) {
      return null;
    }

    // Get IPv4 address (prefer IPv4 over IPv6)
    const ipAddress = this.getIPv4Address(service);
    if (!ipAddress) {
      return null;
    }

    return {
      serial,
      ipAddress,
      hostname: service.host,
      port: service.port,
    };
  }

  /**
   * Extract serial number from mDNS service name
   */
  private extractSerial(serviceName: string): string | null {
    // Dyson serial numbers follow pattern: XXX-XX-XXXXXXXX
    // Service name formats:
    //   - "ABC-AB-12345678" (serial only)
    //   - "ABC-AB-12345678_dyson_mqtt" (serial with suffix)
    //   - "455_ABC-AB-12345678" (product type prefix + serial)
    //   - "455_ABC-AB-12345678_dyson_mqtt" (product type + serial + suffix)
    const match = serviceName.match(/(?:^\d+_)?([A-Z0-9]{2,3}-[A-Z0-9]{2}-[A-Z0-9]{8})/i);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Get IPv4 address from service, preferring IPv4 over IPv6
   */
  private getIPv4Address(service: Service): string | null {
    // Only local-network addresses are accepted: the plugin sends the device
    // credentials to whatever host answers, so a spoofed mDNS record pointing
    // at a public address must not be trusted.
    const addresses = (service.addresses || []).filter(isLocalNetworkAddress);

    // First try to find an IPv4 address
    const ipv4 = addresses.find((addr) => isIPv4(addr));
    if (ipv4) {
      return ipv4;
    }

    // Fall back to referer if available and is a private IPv4
    const referer = service.referer?.address;
    if (referer && isIPv4(referer) && isLocalNetworkAddress(referer)) {
      return referer;
    }

    // If no IPv4 found, return first local address (might be IPv6)
    return addresses[0] || null;
  }

  /**
   * Validate and clamp timeout value
   */
  private validateTimeout(timeout: number): number {
    if (timeout < MIN_TIMEOUT) {
      return MIN_TIMEOUT;
    }
    if (timeout > MAX_TIMEOUT) {
      return MAX_TIMEOUT;
    }
    return timeout;
  }

  /**
   * Clean up bonjour resources
   */
  private cleanup(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
  }
}
