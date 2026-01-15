/**
 * mDNS Discovery for Dyson Devices
 * Discovers Dyson devices on the local network via mDNS/Bonjour
 */

import { Bonjour, type Browser, type Service } from 'bonjour-service';

import { DYSON_MDNS_SERVICE } from '../config/index.js';

/** Default discovery timeout in milliseconds */
const DEFAULT_TIMEOUT = 10000;

/** Minimum timeout allowed */
const MIN_TIMEOUT = 1000;

/** Maximum timeout allowed */
const MAX_TIMEOUT = 60000;

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
    const timeout = this.validateTimeout(options.timeout ?? DEFAULT_TIMEOUT);
    const maxDevices = options.maxDevices ?? 0;

    const devices = new Map<string, string>();

    return new Promise((resolve) => {
      this.bonjour = this.bonjourFactory();

      // Service type is 'dyson_mqtt' (without leading underscore for bonjour-service)
      const serviceType = DYSON_MDNS_SERVICE.replace('_', '').replace('._tcp', '');

      this.browser = this.bonjour.find({ type: serviceType });

      this.browser.on('up', (service: Service) => {
        const device = this.parseService(service);
        if (device) {
          devices.set(device.serial, device.ipAddress);

          // Stop early if we found enough devices
          if (maxDevices > 0 && devices.size >= maxDevices) {
            this.cleanup();
            resolve(devices);
          }
        }
      });

      // Set timeout to stop discovery
      setTimeout(() => {
        this.cleanup();
        resolve(devices);
      }, timeout);
    });
  }

  /**
   * Discover devices and return detailed information
   *
   * @param options - Discovery options
   * @returns Array of discovered device details
   */
  async discoverDetailed(options: DiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    const timeout = this.validateTimeout(options.timeout ?? DEFAULT_TIMEOUT);
    const maxDevices = options.maxDevices ?? 0;

    const devices: DiscoveredDevice[] = [];

    return new Promise((resolve) => {
      this.bonjour = this.bonjourFactory();

      const serviceType = DYSON_MDNS_SERVICE.replace('_', '').replace('._tcp', '');

      this.browser = this.bonjour.find({ type: serviceType });

      this.browser.on('up', (service: Service) => {
        const device = this.parseService(service);
        if (device) {
          // Avoid duplicates
          if (!devices.some((d) => d.serial === device.serial)) {
            devices.push(device);
          }

          // Stop early if we found enough devices
          if (maxDevices > 0 && devices.length >= maxDevices) {
            this.cleanup();
            resolve(devices);
          }
        }
      });

      // Set timeout to stop discovery
      setTimeout(() => {
        this.cleanup();
        resolve(devices);
      }, timeout);
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
    const addresses = service.addresses || [];

    // First try to find an IPv4 address
    for (const addr of addresses) {
      if (this.isIPv4(addr)) {
        return addr;
      }
    }

    // Fall back to referer if available and is IPv4
    if (service.referer && this.isIPv4(service.referer.address)) {
      return service.referer.address;
    }

    // If no IPv4 found, return first address (might be IPv6)
    return addresses[0] || null;
  }

  /**
   * Check if address is IPv4
   */
  private isIPv4(address: string): boolean {
    // Simple IPv4 check: contains dots and no colons
    return address.includes('.') && !address.includes(':');
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
