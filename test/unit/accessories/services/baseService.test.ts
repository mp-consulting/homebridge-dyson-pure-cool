/**
 * BaseService Unit Tests
 *
 * Exercises the shared service-handler plumbing through a small concrete subclass.
 */

import { EventEmitter } from 'node:events';
import { vi, type Mock } from 'vitest';

import { BaseService } from '../../../../src/accessories/services/baseService.js';
import type { BaseServiceConfig, ServiceIdentity } from '../../../../src/accessories/services/baseService.js';
import type { DysonDevice } from '../../../../src/devices/dysonDevice.js';
import type { DeviceState } from '../../../../src/devices/types.js';
import type { API, Logging, PlatformAccessory, Service } from 'homebridge';
import { HapStatusError, createMockHapApi, createMockLog, createMockService, type MockService } from '../../../helpers/mocks.js';

const Characteristic = {
  On: { UUID: 'on-uuid' },
  RotationSpeed: { UUID: 'rotation-speed-uuid' },
  ConfiguredName: { UUID: 'configured-name-uuid' },
};

const ServiceTypes = {
  Switch: { UUID: 'switch-uuid' },
};

function createMockApi(): API {
  return createMockHapApi({ Service: ServiceTypes, Characteristic });
}


/** Minimal device: an EventEmitter with controllable state and connection */
class FakeDevice extends EventEmitter {
  connected = true;
  state: Partial<DeviceState> = { isOn: false, fanSpeed: 3 };

  isConnected(): boolean {
    return this.connected;
  }

  getState(): DeviceState {
    return { ...this.state } as DeviceState;
  }

  emitState(partial: Partial<DeviceState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('stateChange', this.getState());
  }
}

/** Concrete subclass exposing the protected helpers */
class TestService extends BaseService {
  protected handleStateChange(state: DeviceState): void {
    this.update(this.api.hap.Characteristic.On, state.isOn);
    this.update(this.api.hap.Characteristic.RotationSpeed, state.fanSpeed * 10);
  }

  callAssertConnected(): void {
    this.assertConnected();
  }

  callRunCommand(description: string, command: () => Promise<void>): Promise<void> {
    return this.runCommand(description, command);
  }

  callCachedValue(): unknown {
    return this.cachedValue(this.api.hap.Characteristic.On);
  }
}

const IDENTITY: Omit<ServiceIdentity, 'type'> = { name: 'Test Switch', subtype: 'test-switch' };

describe('BaseService', () => {
  let api: API;
  let log: Logging;
  let device: FakeDevice;
  let mockService: MockService;
  let accessory: PlatformAccessory & { getServiceById: Mock; addService: Mock };

  function createService(overrides: Partial<BaseServiceConfig> = {}, identity: Partial<ServiceIdentity> = {}): TestService {
    return new TestService(
      {
        accessory,
        device: device as unknown as DysonDevice,
        api,
        log,
        ...overrides,
      },
      { type: ServiceTypes.Switch as unknown as ServiceIdentity['type'], ...IDENTITY, ...identity },
    );
  }

  beforeEach(() => {
    api = createMockApi();
    log = createMockLog();
    device = new FakeDevice();
    mockService = createMockService(null);
    accessory = {
      displayName: 'Test Accessory',
      getServiceById: vi.fn().mockReturnValue(undefined),
      addService: vi.fn().mockReturnValue(mockService),
    } as unknown as PlatformAccessory & { getServiceById: Mock; addService: Mock };
  });

  describe('service lookup and creation', () => {
    it('should create the service and set ConfiguredName when not cached', () => {
      const service = createService();

      expect(accessory.getServiceById).toHaveBeenCalledWith(ServiceTypes.Switch, 'test-switch');
      expect(accessory.addService).toHaveBeenCalledWith(ServiceTypes.Switch, 'Test Switch', 'test-switch');
      expect(mockService.addOptionalCharacteristic).toHaveBeenCalledWith(Characteristic.ConfiguredName);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.ConfiguredName, 'Test Switch');
      expect(service.getService()).toBe(mockService);
    });

    it('should reuse a cached service without touching its ConfiguredName', () => {
      const existing = createMockService(null);
      accessory.getServiceById.mockReturnValue(existing);

      const service = createService();

      expect(service.getService()).toBe(existing);
      expect(accessory.addService).not.toHaveBeenCalled();
      expect(existing.addOptionalCharacteristic).not.toHaveBeenCalled();
      expect(existing.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('should use findExisting instead of getServiceById when given', () => {
      const existing = createMockService(null);
      const findExisting = vi.fn().mockReturnValue(existing);

      const service = createService({}, { findExisting });

      expect(findExisting).toHaveBeenCalledWith(accessory);
      expect(accessory.getServiceById).not.toHaveBeenCalled();
      expect(accessory.addService).not.toHaveBeenCalled();
      expect(service.getService()).toBe(existing);
      expect(existing.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('should create the service when findExisting finds nothing', () => {
      const findExisting = vi.fn().mockReturnValue(undefined);

      const service = createService({}, { findExisting });

      expect(accessory.getServiceById).not.toHaveBeenCalled();
      expect(accessory.addService).toHaveBeenCalledWith(ServiceTypes.Switch, 'Test Switch', 'test-switch');
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.ConfiguredName, 'Test Switch');
      expect(service.getService()).toBe(mockService);
    });

    it('should link to the primary service when given', () => {
      const primary = createMockService(null);

      createService({ primaryService: primary as unknown as Service });

      expect(primary.addLinkedService).toHaveBeenCalledWith(mockService);
    });

    it('should not link a service to itself', () => {
      createService({ primaryService: mockService as unknown as Service });

      expect(mockService.addLinkedService).not.toHaveBeenCalled();
    });
  });

  describe('update de-duplication', () => {
    it('should push each changed value once and skip unchanged values', () => {
      createService();
      mockService.updateCharacteristic.mockClear();

      device.emitState({ isOn: true });
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.On, true);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.RotationSpeed, 30);
      expect(mockService.updateCharacteristic).toHaveBeenCalledTimes(2);

      mockService.updateCharacteristic.mockClear();
      device.emitState({ fanSpeed: 5 });
      // Only RotationSpeed changed
      expect(mockService.updateCharacteristic).toHaveBeenCalledTimes(1);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.RotationSpeed, 50);

      mockService.updateCharacteristic.mockClear();
      device.emitState({});
      expect(mockService.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('updateFromState should re-push every characteristic even if unchanged', () => {
      const service = createService();
      device.emitState({ isOn: true });
      mockService.updateCharacteristic.mockClear();

      service.updateFromState();

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.On, true);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(Characteristic.RotationSpeed, 30);
      expect(mockService.updateCharacteristic).toHaveBeenCalledTimes(2);

      // After the forced push, de-duplication applies again
      mockService.updateCharacteristic.mockClear();
      device.emitState({});
      expect(mockService.updateCharacteristic).not.toHaveBeenCalled();
    });
  });

  describe('cachedValue', () => {
    it('should return the value HomeKit currently holds', () => {
      const service = createService();
      mockService._getCharacteristic(Characteristic.On).value = true;

      expect(service.callCachedValue()).toBe(true);
    });
  });

  describe('assertConnected', () => {
    it('should not throw when the device is connected', () => {
      const service = createService();

      expect(() => service.callAssertConnected()).not.toThrow();
    });

    it('should throw HapStatusError(-70402) when the device is disconnected', () => {
      const service = createService();
      device.connected = false;

      let thrown: unknown;
      try {
        service.callAssertConnected();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(HapStatusError);
      expect((thrown as HapStatusError).hapStatus).toBe(-70402);
    });
  });

  describe('runCommand', () => {
    it('should resolve when the command succeeds', async () => {
      const service = createService();
      const command = vi.fn().mockResolvedValue(undefined);

      await expect(service.callRunCommand('do thing', command)).resolves.toBeUndefined();
      expect(command).toHaveBeenCalledTimes(1);
      expect(log.error).not.toHaveBeenCalled();
    });

    it('should log and throw HapStatusError(-70402) when the command fails', async () => {
      const service = createService();
      const command = vi.fn().mockRejectedValue(new Error('Device not connected'));

      const result = service.callRunCommand('set fan speed', command);

      await expect(result).rejects.toBeInstanceOf(HapStatusError);
      await expect(result).rejects.toMatchObject({ hapStatus: -70402 });
      expect(log.error).toHaveBeenCalledWith('Failed to set fan speed: Device not connected');
    });

    it('should stringify non-Error rejections in the log', async () => {
      const service = createService();

      await expect(service.callRunCommand('toggle', () => Promise.reject('boom'))).rejects.toMatchObject({
        hapStatus: -70402,
      });
      expect(log.error).toHaveBeenCalledWith('Failed to toggle: boom');
    });
  });

  describe('destroy', () => {
    it('should unsubscribe from device state changes', () => {
      const service = createService();
      expect(device.listenerCount('stateChange')).toBe(1);

      service.destroy();
      mockService.updateCharacteristic.mockClear();
      device.emitState({ isOn: true, fanSpeed: 9 });

      expect(device.listenerCount('stateChange')).toBe(0);
      expect(mockService.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('should only remove its own listener', () => {
      const first = createService();
      createService();
      expect(device.listenerCount('stateChange')).toBe(2);

      first.destroy();

      expect(device.listenerCount('stateChange')).toBe(1);
    });
  });
});
