import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { DysonPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './config/index.js';
import { MdnsDiscovery } from './discovery/index.js';

// This is only required when using Custom Services and Characteristics not support by HomeKit
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';

/** Default mDNS discovery timeout in milliseconds */
const DEFAULT_DISCOVERY_TIMEOUT = 10000;

/**
 * DysonPureCoolPlatform
 * Main platform class for the Dyson Pure Cool Homebridge plugin.
 * Handles device discovery, registration, and lifecycle management.
 */
export class DysonPureCoolPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  // This is only required when using Custom Services and Characteristics not support by HomeKit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomServices: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomCharacteristics: any;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // This is only required when using Custom Services and Characteristics not support by HomeKit
    this.CustomServices = new EveHomeKitTypes(this.api).Services;
    this.CustomCharacteristics = new EveHomeKitTypes(this.api).Characteristics;

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      await this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Discover and register devices from the platform configuration.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices(): Promise<void> {
    // Get devices from config (populated by the Custom UI wizard)
    const devices = this.config.devices || [];

    if (devices.length === 0) {
      this.log.warn('No devices configured. Please use the plugin settings to add your Dyson devices.');
      return;
    }

    this.log.info(`Found ${devices.length} device(s) in configuration`);

    // Run mDNS discovery for devices without IP addresses
    const devicesNeedingIP = devices.filter((d: { ipAddress?: string }) => !d.ipAddress);
    let discoveredIPs = new Map<string, string>();

    if (devicesNeedingIP.length > 0) {
      this.log.info(`Discovering IP addresses for ${devicesNeedingIP.length} device(s) via mDNS...`);
      const timeout = this.config.discoveryTimeout ?? DEFAULT_DISCOVERY_TIMEOUT;

      try {
        const discovery = new MdnsDiscovery();
        discoveredIPs = await discovery.discover({ timeout });
        this.log.info(`mDNS discovery found ${discoveredIPs.size} device(s)`);

        // Log discovered devices
        for (const [serial, ip] of discoveredIPs) {
          this.log.debug(`Discovered device ${serial} at ${ip}`);
        }
      } catch (error) {
        this.log.warn('mDNS discovery failed:', error);
      }
    }

    // loop over the configured devices and register each one if it has not already been registered
    for (const device of devices) {
      // Inject discovered IP address if not already configured
      if (!device.ipAddress && discoveredIPs.has(device.serial)) {
        device.ipAddress = discoveredIPs.get(device.serial);
        this.log.info(`Using discovered IP ${device.ipAddress} for device ${device.serial}`);
      }
      // generate a unique id for the accessory using the device serial number
      const uuid = this.api.hap.uuid.generate(device.serial);

      // determine display name (use configured name, or fall back to serial)
      const displayName = device.name || `Dyson ${device.serial}`;

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // Update the accessory context with the latest device config
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        new DysonPlatformAccessory(this, existingAccessory);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', displayName);

        // create a new accessory
        const accessory = new this.api.platformAccessory(displayName, uuid);

        // store a copy of the device object in the `accessory.context`
        accessory.context.device = device;

        // link the accessory to your platform FIRST
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

        // create the accessory handler for the newly created accessory AFTER registration
        new DysonPlatformAccessory(this, accessory);
      }

      // push into discoveredCacheUUIDs
      this.discoveredCacheUUIDs.push(uuid);
    }

    // Remove cached accessories that are no longer in the config
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing accessory no longer in config:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
