/**
 * DysonDevice Unit Tests
 */

import { vi } from 'vitest';

import { DysonDevice, DEFAULT_FEATURES, createDefaultState } from '../../../src/devices/dysonDevice.js';
import type { DeviceInfo, DeviceState, DeviceFeatures, MqttClientFactory } from '../../../src/devices/dysonDevice.js';
import type { MqttMessage } from '../../../src/protocol/mqttClient.js';
import { createMockMqttClient } from '../../helpers/mocks.js';

// Concrete test implementation of abstract DysonDevice
class TestDevice extends DysonDevice {
  readonly productType = '438';
  readonly supportedFeatures: DeviceFeatures = {
    ...DEFAULT_FEATURES,
    temperatureSensor: true,
    humiditySensor: true,
    airQualitySensor: true,
  };

  public handleStateMessageCalls: Record<string, unknown>[] = [];

  protected handleStateMessage(data: Record<string, unknown>): void {
    this.handleStateMessageCalls.push(data);

    const productState = (data['product-state'] as Record<string, string>) || (data.data as Record<string, string>) || {};

    const stateUpdate: Partial<DeviceState> = {};

    // Fan power
    if (productState.fpwr) {
      stateUpdate.isOn = productState.fpwr === 'ON';
    }

    // Fan speed
    if (productState.fnsp) {
      if (productState.fnsp === 'AUTO') {
        stateUpdate.fanSpeed = -1;
        stateUpdate.autoMode = true;
      } else {
        stateUpdate.fanSpeed = parseInt(productState.fnsp, 10);
        stateUpdate.autoMode = false;
      }
    }

    // Oscillation
    if (productState.oson) {
      stateUpdate.oscillation = productState.oson === 'ON';
    }

    // Night mode
    if (productState.nmod) {
      stateUpdate.nightMode = productState.nmod === 'ON';
    }

    if (Object.keys(stateUpdate).length > 0) {
      this.updateState(stateUpdate);
    }
  }

  // Expose protected methods for testing
  public testSendCommand(data: Record<string, unknown>): Promise<void> {
    return this.sendCommand(data);
  }

  public testUpdateState(partial: Partial<DeviceState>): void {
    this.updateState(partial);
  }

  public testHandleMessage(message: MqttMessage): void {
    this.handleMessage(message);
  }
}

describe('DysonDevice', () => {
  let device: TestDevice;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockMqttClientFactory: MqttClientFactory;

  const defaultDeviceInfo: DeviceInfo = {
    serial: 'ABC-AB-12345678',
    productType: '438',
    name: 'Living Room',
    credentials: 'localPassword123',
    ipAddress: '192.168.1.100',
  };

  beforeEach(() => {
    mockMqttClient = createMockMqttClient();
    mockMqttClientFactory = vi.fn().mockReturnValue(mockMqttClient);
    device = new TestDevice(defaultDeviceInfo, mockMqttClientFactory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const state = device.getState();
      expect(state.connected).toBe(false);
      expect(state.isOn).toBe(false);
      expect(state.fanSpeed).toBe(0);
      expect(state.oscillation).toBe(false);
    });

    it('should store device info', () => {
      expect(device.getSerial()).toBe('ABC-AB-12345678');
      expect(device.getName()).toBe('Living Room');
      expect(device.getIpAddress()).toBe('192.168.1.100');
    });

    it('should have abstract properties defined', () => {
      expect(device.productType).toBe('438');
      expect(device.supportedFeatures.fan).toBe(true);
      expect(device.supportedFeatures.airQualitySensor).toBe(true);
    });
  });

  describe('connect', () => {
    it('should connect to the device via MQTT', async () => {
      await device.connect();

      expect(mockMqttClientFactory).toHaveBeenCalledWith(
        '192.168.1.100',
        'ABC-AB-12345678',
        'localPassword123',
        '438',
        undefined,
      );
      expect(mockMqttClient.connect).toHaveBeenCalled();
      expect(mockMqttClient.subscribeToStatus).toHaveBeenCalled();
      expect(mockMqttClient.requestCurrentState).toHaveBeenCalled();
    });

    it('should emit connect event', async () => {
      const connectHandler = vi.fn();
      device.on('connect', connectHandler);

      await device.connect();

      expect(connectHandler).toHaveBeenCalled();
    });

    it('should update state to connected', async () => {
      await device.connect();

      expect(device.getState().connected).toBe(true);
    });

    it('should throw error if no IP address', async () => {
      const deviceWithoutIp = new TestDevice(
        { ...defaultDeviceInfo, ipAddress: undefined },
        mockMqttClientFactory,
      );

      await expect(deviceWithoutIp.connect()).rejects.toThrow('No IP address');
    });

    it('should not reconnect if already connected', async () => {
      await device.connect();

      // Try to connect again
      await device.connect();

      expect(mockMqttClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should dispose the previous MQTT client when connecting again', async () => {
      await device.connect();

      // Connection lost: the old client no longer reports connected
      mockMqttClient.isConnected.mockReturnValue(false);
      const secondClient = createMockMqttClient();
      vi.mocked(mockMqttClientFactory).mockReturnValueOnce(secondClient);

      await device.connect();

      expect(mockMqttClient.removeAllListeners).toHaveBeenCalled();
      expect(mockMqttClient.disconnect).toHaveBeenCalled();
      expect(mockMqttClient.removeAllListeners.mock.invocationCallOrder[0])
        .toBeLessThan(mockMqttClient.disconnect.mock.invocationCallOrder[0]);
      expect(secondClient.connect).toHaveBeenCalled();
      expect(secondClient.disconnect).not.toHaveBeenCalled();
    });

    it('should ignore events from a disposed client after reconnecting', async () => {
      await device.connect();
      mockMqttClient.isConnected.mockReturnValue(false);
      const secondClient = createMockMqttClient();
      vi.mocked(mockMqttClientFactory).mockReturnValueOnce(secondClient);
      await device.connect();

      const disconnectHandler = vi.fn();
      device.on('disconnect', disconnectHandler);

      // Old client's handlers were removed, so its events are not forwarded
      mockMqttClient._emit('disconnect');

      expect(disconnectHandler).not.toHaveBeenCalled();
      expect(device.getState().connected).toBe(true);
    });

    it('should dispose the new client when connect() throws', async () => {
      mockMqttClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(device.connect()).rejects.toThrow('Connection refused');

      expect(mockMqttClient.removeAllListeners).toHaveBeenCalled();
      expect(mockMqttClient.disconnect).toHaveBeenCalled();
      expect(device.isConnected()).toBe(false);
    });

    it('should dispose the new client when subscribeToStatus throws', async () => {
      mockMqttClient.subscribeToStatus.mockRejectedValueOnce(new Error('Subscribe failed'));

      await expect(device.connect()).rejects.toThrow('Subscribe failed');

      expect(mockMqttClient.removeAllListeners).toHaveBeenCalled();
      expect(mockMqttClient.disconnect).toHaveBeenCalled();
      expect(mockMqttClient.requestCurrentState).not.toHaveBeenCalled();
      expect(device.isConnected()).toBe(false);
    });

    it('should create a fresh client on retry after a failed connect', async () => {
      mockMqttClient.subscribeToStatus.mockRejectedValueOnce(new Error('Subscribe failed'));
      await expect(device.connect()).rejects.toThrow('Subscribe failed');

      const secondClient = createMockMqttClient();
      vi.mocked(mockMqttClientFactory).mockReturnValueOnce(secondClient);
      await device.connect();

      expect(mockMqttClientFactory).toHaveBeenCalledTimes(2);
      expect(secondClient.connect).toHaveBeenCalled();
      expect(device.isConnected()).toBe(true);
    });
  });

  describe('setIpAddress', () => {
    it('should update the IP address returned by getIpAddress', () => {
      device.setIpAddress('192.168.1.200');
      expect(device.getIpAddress()).toBe('192.168.1.200');
    });

    it('should use the new IP address on the next connect', async () => {
      device.setIpAddress('10.0.0.5');
      await device.connect();

      expect(mockMqttClientFactory).toHaveBeenCalledWith(
        '10.0.0.5',
        'ABC-AB-12345678',
        'localPassword123',
        '438',
        undefined,
      );
    });

    it('should allow connecting a device created without an IP address', async () => {
      const deviceWithoutIp = new TestDevice(
        { ...defaultDeviceInfo, ipAddress: undefined },
        mockMqttClientFactory,
      );
      deviceWithoutIp.setIpAddress('192.168.1.150');

      await expect(deviceWithoutIp.connect()).resolves.toBeUndefined();
      expect(mockMqttClientFactory).toHaveBeenCalledWith(
        '192.168.1.150',
        expect.any(String),
        expect.any(String),
        '438',
        undefined,
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the device', async () => {
      await device.connect();
      await device.disconnect();

      expect(mockMqttClient.disconnect).toHaveBeenCalled();
      expect(device.getState().connected).toBe(false);
    });

    it('should remove listeners from the MQTT client on disconnect', async () => {
      await device.connect();
      await device.disconnect();

      expect(mockMqttClient.removeAllListeners).toHaveBeenCalled();
    });

    it('should emit disconnect event', async () => {
      const disconnectHandler = vi.fn();
      device.on('disconnect', disconnectHandler);

      await device.connect();
      await device.disconnect();

      expect(disconnectHandler).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(device.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(device.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      await device.connect();
      expect(device.isConnected()).toBe(true);
    });
  });

  describe('state management', () => {
    it('should emit stateChange on updateState', () => {
      const stateChangeHandler = vi.fn();
      device.on('stateChange', stateChangeHandler);

      device.testUpdateState({ isOn: true, fanSpeed: 5 });

      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({ isOn: true, fanSpeed: 5 }),
      );
    });

    it('should merge state updates', () => {
      device.testUpdateState({ isOn: true });
      device.testUpdateState({ fanSpeed: 5 });

      const state = device.getState();
      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(5);
    });

    it('should not emit stateChange when nothing changed', () => {
      device.testUpdateState({ isOn: true, fanSpeed: 5 });

      const stateChangeHandler = vi.fn();
      device.on('stateChange', stateChangeHandler);

      device.testUpdateState({ isOn: true, fanSpeed: 5 });
      device.testUpdateState({ isOn: true });

      expect(stateChangeHandler).not.toHaveBeenCalled();
    });

    it('should emit stateChange when any one field changed', () => {
      device.testUpdateState({ isOn: true, fanSpeed: 5 });

      const stateChangeHandler = vi.fn();
      device.on('stateChange', stateChangeHandler);

      device.testUpdateState({ isOn: true, fanSpeed: 6 });

      expect(stateChangeHandler).toHaveBeenCalledTimes(1);
      expect(stateChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({ isOn: true, fanSpeed: 6 }),
      );
    });

    it('should emit a copy of the state', () => {
      const stateChangeHandler = vi.fn();
      device.on('stateChange', stateChangeHandler);

      device.testUpdateState({ isOn: true });
      const emitted = stateChangeHandler.mock.calls[0][0] as DeviceState;

      // Mutating the emitted object must not affect the device
      emitted.isOn = false;
      emitted.fanSpeed = 99;
      expect(device.getState().isOn).toBe(true);
      expect(device.getState().fanSpeed).toBe(0);

      // A later emit is a different object
      device.testUpdateState({ fanSpeed: 3 });
      expect(stateChangeHandler.mock.calls[1][0]).not.toBe(emitted);
    });

    it('should return immutable state copy', () => {
      const state1 = device.getState();
      device.testUpdateState({ isOn: true });
      const state2 = device.getState();

      expect(state1.isOn).toBe(false);
      expect(state2.isOn).toBe(true);
    });
  });

  describe('sendCommand', () => {
    it('should send command via MQTT', async () => {
      await device.connect();

      await device.testSendCommand({ fpwr: 'ON' });

      expect(mockMqttClient.publishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'STATE-SET',
          'mode-reason': 'LAPP',
          data: { fpwr: 'ON' },
        }),
      );
    });

    it('should throw error if not connected', async () => {
      mockMqttClient.isConnected.mockReturnValue(false);

      await expect(device.testSendCommand({ fpwr: 'ON' })).rejects.toThrow('Device not connected');
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should handle CURRENT-STATE message', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fpwr: 'ON',
            fnsp: '0005',
            oson: 'ON',
            nmod: 'OFF',
          },
        },
      };

      device.testHandleMessage(message);

      expect(device.handleStateMessageCalls).toHaveLength(1);
      const state = device.getState();
      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(5);
      expect(state.oscillation).toBe(true);
      expect(state.nightMode).toBe(false);
    });

    it('should handle STATE-CHANGE message', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'STATE-CHANGE',
          'product-state': {
            fpwr: 'OFF',
          },
        },
      };

      device.testHandleMessage(message);

      expect(device.handleStateMessageCalls).toHaveLength(1);
      expect(device.getState().isOn).toBe(false);
    });

    it('should handle ENVIRONMENTAL-CURRENT-SENSOR-DATA message', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'ENVIRONMENTAL-CURRENT-SENSOR-DATA',
          data: {
            tact: '2950',
            hact: '0045',
            p25r: '0003',
            p10r: '0005',
            va10: '0002',
            noxl: '0001',
          },
        },
      };

      device.testHandleMessage(message);

      const state = device.getState();
      expect(state.temperature).toBe(2950);
      expect(state.humidity).toBe(45);
      expect(state.pm25).toBe(3);
      expect(state.pm10).toBe(5);
      expect(state.vocIndex).toBe(2);
      expect(state.no2Index).toBe(1);
    });

    it('should handle auto mode speed', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'CURRENT-STATE',
          'product-state': {
            fnsp: 'AUTO',
          },
        },
      };

      device.testHandleMessage(message);

      const state = device.getState();
      expect(state.fanSpeed).toBe(-1);
      expect(state.autoMode).toBe(true);
    });

    it('should ignore messages without data', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('not json'),
      };

      device.testHandleMessage(message);

      expect(device.handleStateMessageCalls).toHaveLength(0);
    });

    it('should ignore unknown message types', () => {
      const message: MqttMessage = {
        topic: '438/ABC-AB-12345678/status/current',
        payload: Buffer.from('{}'),
        data: {
          msg: 'UNKNOWN-TYPE',
        },
      };

      device.testHandleMessage(message);

      expect(device.handleStateMessageCalls).toHaveLength(0);
    });
  });

  describe('MQTT event handling', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should handle MQTT disconnect event', () => {
      const disconnectHandler = vi.fn();
      device.on('disconnect', disconnectHandler);

      mockMqttClient._emit('disconnect');

      expect(device.getState().connected).toBe(false);
      expect(disconnectHandler).toHaveBeenCalled();
    });

    it('should handle MQTT connect event', () => {
      const connectHandler = vi.fn();
      device.on('connect', connectHandler);

      // Reset state
      device.testUpdateState({ connected: false });

      mockMqttClient._emit('connect');

      expect(device.getState().connected).toBe(true);
      expect(connectHandler).toHaveBeenCalled();
    });

    it('should handle MQTT error event', () => {
      const errorHandler = vi.fn();
      device.on('error', errorHandler);

      const error = new Error('MQTT error');
      mockMqttClient._emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should not change connected state on MQTT offline event', () => {
      const stateChangeHandler = vi.fn();
      device.on('stateChange', stateChangeHandler);

      mockMqttClient._emit('offline');

      // Only 'disconnect' marks the device as disconnected
      expect(device.getState().connected).toBe(true);
      expect(stateChangeHandler).not.toHaveBeenCalled();
    });

    it('should re-emit MQTT reconnectFailed as reconnectFailed', () => {
      const errorHandler = vi.fn();
      const reconnectFailedHandler = vi.fn();
      device.on('error', errorHandler);
      device.on('reconnectFailed', reconnectFailedHandler);

      mockMqttClient._emit('reconnectFailed');

      expect(device.getState().connected).toBe(false);
      expect(reconnectFailedHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe('createDefaultState', () => {
    it('should create valid default state', () => {
      const state = createDefaultState();

      expect(state.connected).toBe(false);
      expect(state.isOn).toBe(false);
      expect(state.fanSpeed).toBe(0);
      expect(state.oscillation).toBe(false);
      expect(state.autoMode).toBe(false);
      expect(state.nightMode).toBe(false);
    });
  });

  describe('DEFAULT_FEATURES', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_FEATURES.fan).toBe(true);
      expect(DEFAULT_FEATURES.oscillation).toBe(true);
      expect(DEFAULT_FEATURES.autoMode).toBe(true);
      expect(DEFAULT_FEATURES.nightMode).toBe(true);
      expect(DEFAULT_FEATURES.heating).toBe(false);
      expect(DEFAULT_FEATURES.humidifier).toBe(false);
      expect(DEFAULT_FEATURES.airQualitySensor).toBe(false);
    });
  });
});
