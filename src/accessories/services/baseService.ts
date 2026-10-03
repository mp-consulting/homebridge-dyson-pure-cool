/**
 * Base Service Handler
 *
 * Shared plumbing for every HomeKit service handler:
 * - get-or-create the HomeKit service (ConfiguredName is only set on creation,
 *   so names the user changed in the Home app survive restarts)
 * - link to the primary service
 * - subscribe to device state changes and push only values that differ from
 *   what HomeKit currently holds
 * - report "Not Responding" while the device is disconnected
 * - surface failed commands to HomeKit as communication failures
 */

import type {
  API,
  Characteristic,
  CharacteristicValue,
  Logging,
  PlatformAccessory,
  Service,
  WithUUID,
} from 'homebridge';

import type { DysonDevice } from '../../devices/dysonDevice.js';
import type { DeviceState } from '../../devices/types.js';

/**
 * HAPStatus.SERVICE_COMMUNICATION_FAILURE. HAPStatus is a const enum, which
 * can't be referenced under isolatedModules.
 */
const SERVICE_COMMUNICATION_FAILURE = -70402;

/** A HomeKit characteristic class, e.g. `Characteristic.On` */
export type CharacteristicType = WithUUID<new () => Characteristic>;

/** A HomeKit service class, e.g. `Service.Switch` */
export type ServiceType = WithUUID<typeof Service>;

/**
 * Configuration shared by all service handlers
 */
export interface BaseServiceConfig<D extends DysonDevice = DysonDevice> {
  accessory: PlatformAccessory;
  device: D;
  api: API;
  log: Logging;
  /** Primary service to link this service to */
  primaryService?: Service;
}

/**
 * Identity of the HomeKit service a handler manages
 */
export interface ServiceIdentity {
  /** HomeKit service class */
  type: ServiceType;
  /** Default display name, used only when the service is first created */
  name: string;
  /** Subtype distinguishing this service from others of the same type */
  subtype: string;
  /** Custom lookup for an existing service (defaults to type + subtype) */
  findExisting?: (accessory: PlatformAccessory) => Service | undefined;
}

/**
 * Abstract base class for HomeKit service handlers
 */
export abstract class BaseService<D extends DysonDevice = DysonDevice> {
  protected readonly service: Service;
  protected readonly device: D;
  protected readonly log: Logging;
  protected readonly api: API;

  /**
   * Last value pushed per characteristic UUID. Marks which characteristics
   * have been pushed at least once, and is the comparison value when a
   * characteristic exposes no current value.
   */
  private readonly lastPushed = new Map<string, CharacteristicValue>();
  private readonly boundHandleStateChange: (state: DeviceState) => void;

  constructor(config: BaseServiceConfig<D>, identity: ServiceIdentity) {
    this.device = config.device;
    this.log = config.log;
    this.api = config.api;

    const Characteristic = this.api.hap.Characteristic;
    const existing = identity.findExisting
      ? identity.findExisting(config.accessory)
      : config.accessory.getServiceById(identity.type, identity.subtype);

    if (existing) {
      this.service = existing;
    } else {
      this.service = config.accessory.addService(identity.type, identity.name, identity.subtype);
      // Set ConfiguredName for better HomeKit display. Only on creation:
      // afterwards the user owns the name.
      this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.service.updateCharacteristic(Characteristic.ConfiguredName, identity.name);
    }

    if (config.primaryService && config.primaryService !== this.service) {
      config.primaryService.addLinkedService(this.service);
    }

    this.boundHandleStateChange = (state: DeviceState) => this.handleStateChange(state);
    this.device.on('stateChange', this.boundHandleStateChange);
  }

  /**
   * Map device state onto the service's characteristics.
   * Implementations should push values with {@link update}.
   */
  protected abstract handleStateChange(state: DeviceState): void;

  /**
   * Get the underlying HomeKit service
   */
  getService(): Service {
    return this.service;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.device.off('stateChange', this.boundHandleStateChange);
  }

  /**
   * Push every characteristic from the current device state, even if unchanged.
   * Call this after (re)connecting to sync HomeKit with the device.
   */
  updateFromState(): void {
    this.lastPushed.clear();
    this.handleStateChange(this.device.getState());
  }

  /**
   * Push a characteristic value to HomeKit if it differs from the last push
   */
  protected update(characteristic: CharacteristicType, value: CharacteristicValue): void {
    // Compare against the value HomeKit holds when available: a SET from the
    // Home app changes it without going through update(), and a device that
    // didn't follow that SET must still be pushed back. Fall back to the last
    // pushed value when the characteristic doesn't expose one.
    const current = this.service.getCharacteristic(characteristic).value;
    const previous = current !== undefined && current !== null ? current : this.lastPushed.get(characteristic.UUID);
    if (previous === value && this.lastPushed.has(characteristic.UUID)) {
      return;
    }
    this.lastPushed.set(characteristic.UUID, value);
    this.service.updateCharacteristic(characteristic, value);
  }

  /**
   * Value HomeKit currently holds for a characteristic. Used as the answer
   * when the device hasn't reported a reading yet, instead of a made-up one.
   */
  protected cachedValue(characteristic: CharacteristicType): CharacteristicValue {
    return this.service.getCharacteristic(characteristic).value as CharacteristicValue;
  }

  /**
   * Throw a HomeKit communication failure when the device is offline, so the
   * Home app shows "Not Responding" instead of stale values.
   */
  protected assertConnected(): void {
    if (!this.device.isConnected()) {
      throw this.communicationFailure();
    }
  }

  /**
   * Run a device command from a SET handler. Failures are logged and
   * reported to HomeKit as a communication failure (a plain Error would be
   * logged by Homebridge as a plugin bug).
   */
  protected async runCommand(description: string, command: () => Promise<void>): Promise<void> {
    try {
      await command();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`Failed to ${description}: ${message}`);
      throw this.communicationFailure();
    }
  }

  private communicationFailure(): Error {
    return new this.api.hap.HapStatusError(SERVICE_COMMUNICATION_FAILURE);
  }
}

/**
 * Configuration for a boolean switch service
 */
export interface BooleanSwitchSpec<D extends DysonDevice> {
  /** Switch subtype */
  subtype: string;
  /** Default display name */
  name: string;
  /** Read the switch state from device state */
  read: (state: DeviceState) => boolean;
  /** Apply the switch state to the device */
  write: (device: D, on: boolean) => Promise<void>;
}

/**
 * A HomeKit Switch mapped to one boolean device setting
 * (jet focus, night mode, continuous monitoring, ...)
 */
export abstract class BooleanSwitchService<D extends DysonDevice> extends BaseService<D> {
  private readonly spec: BooleanSwitchSpec<D>;

  constructor(config: BaseServiceConfig<D>, spec: BooleanSwitchSpec<D>) {
    super(config, { type: config.api.hap.Service.Switch, name: spec.name, subtype: spec.subtype });
    this.spec = spec;

    this.service.getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    this.log.debug(`${spec.name} switch initialized for`, config.accessory.displayName);
  }

  private handleOnGet(): CharacteristicValue {
    this.assertConnected();
    const on = this.spec.read(this.device.getState());
    this.log.debug(`Get ${this.spec.name} ->`, on);
    return on;
  }

  private async handleOnSet(value: CharacteristicValue): Promise<void> {
    const on = value as boolean;
    this.log.debug(`Set ${this.spec.name} ->`, on);
    await this.runCommand(`set ${this.spec.name.toLowerCase()}`, () => this.spec.write(this.device, on));
  }

  protected handleStateChange(state: DeviceState): void {
    this.update(this.api.hap.Characteristic.On, this.spec.read(state));
  }
}
