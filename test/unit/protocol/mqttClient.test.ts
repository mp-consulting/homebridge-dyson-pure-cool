/**
 * DysonMqttClient Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DysonMqttClient } from '../../../src/protocol/mqttClient.js';
import type { MqttConnectFn } from '../../../src/protocol/mqttClient.js';
import type { MqttClient as MqttClientType, IClientOptions } from 'mqtt';

// Create mock MQTT client
function createMockMqttClient() {
  const eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const mockClient = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockClient;
    }),
    end: jest.fn((force: boolean, opts: object, callback: () => void) => {
      callback();
    }),
    subscribe: jest.fn((topic: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    unsubscribe: jest.fn((topic: string, callback: (error?: Error) => void) => {
      callback();
    }),
    publish: jest.fn((topic: string, payload: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    removeAllListeners: jest.fn(),
    // Helper methods for testing
    _emit: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
    _getHandlers: (event: string) => eventHandlers.get(event) || [],
  };

  return mockClient;
}

describe('DysonMqttClient', () => {
  let client: DysonMqttClient;
  let mockMqttClient: ReturnType<typeof createMockMqttClient>;
  let mockConnect: MqttConnectFn;

  const defaultOptions = {
    host: '192.168.1.100',
    serial: 'ABC-AB-12345678',
    credentials: 'localPassword123',
    productType: '438',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockMqttClient = createMockMqttClient();
    mockConnect = jest.fn(() => mockMqttClient as unknown as MqttClientType);
    client = new DysonMqttClient(defaultOptions, mockConnect);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should connect to MQTT broker with correct options', async () => {
      const connectPromise = client.connect();

      // Simulate successful connection
      mockMqttClient._emit('connect');

      await connectPromise;

      expect(mockConnect).toHaveBeenCalledTimes(1);
      const [brokerUrl, options] = (mockConnect as jest.Mock).mock.calls[0] as [string, IClientOptions];
      expect(brokerUrl).toBe('mqtt://192.168.1.100:1883');
      expect(options.username).toBe('ABC-AB-12345678');
      expect(options.password).toBe('localPassword123');
      expect(options.clientId).toContain('homebridge_ABC-AB-12345678_');
      expect(options.keepalive).toBe(30);
      expect(options.connectTimeout).toBe(10000);
      expect(options.protocolVersion).toBe(4);
    });

    it('should emit connect event on successful connection', async () => {
      const connectHandler = jest.fn();
      client.on('connect', connectHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');

      await connectPromise;

      expect(connectHandler).toHaveBeenCalled();
      expect(client.isConnected()).toBe(true);
    });

    it('should resolve immediately if already connected', async () => {
      // First connection
      const firstConnect = client.connect();
      mockMqttClient._emit('connect');
      await firstConnect;

      // Second connection should resolve immediately
      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should reject on connection error', async () => {
      const connectPromise = client.connect();

      mockMqttClient._emit('error', new Error('Connection refused'));

      await expect(connectPromise).rejects.toThrow('Connection refused');
      expect(client.isConnected()).toBe(false);
    });

    it('should reject on connection timeout', async () => {
      const connectPromise = client.connect();

      // Advance time past timeout
      jest.advanceTimersByTime(10001);

      await expect(connectPromise).rejects.toThrow('Connection timeout after 10000ms');
      expect(client.isConnected()).toBe(false);
    });

    it('should use custom timeout when provided', async () => {
      const customClient = new DysonMqttClient(
        { ...defaultOptions, timeout: 5000 },
        mockConnect,
      );

      const connectPromise = customClient.connect();

      jest.advanceTimersByTime(5001);

      await expect(connectPromise).rejects.toThrow('Connection timeout after 5000ms');
    });

    it('should use custom keepalive when provided', async () => {
      const customClient = new DysonMqttClient(
        { ...defaultOptions, keepalive: 60 },
        mockConnect,
      );

      customClient.connect();
      mockMqttClient._emit('connect');

      const [, options] = (mockConnect as jest.Mock).mock.calls[0] as [string, IClientOptions];
      expect(options.keepalive).toBe(60);
    });

    it('should emit error for errors after connection', async () => {
      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      mockMqttClient._emit('error', new Error('Protocol error'));

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should emit disconnect on close after connected', async () => {
      const disconnectHandler = jest.fn();
      const closeHandler = jest.fn();
      client.on('disconnect', disconnectHandler);
      client.on('close', closeHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      mockMqttClient._emit('close');

      expect(disconnectHandler).toHaveBeenCalled();
      expect(closeHandler).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should emit disconnect on offline', async () => {
      const disconnectHandler = jest.fn();
      client.on('disconnect', disconnectHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      mockMqttClient._emit('offline');

      expect(disconnectHandler).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

  });

  describe('disconnect', () => {
    it('should disconnect from broker', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      await client.disconnect();

      expect(mockMqttClient.end).toHaveBeenCalledWith(false, {}, expect.any(Function));
    });

    it('should resolve immediately if not connected', async () => {
      await expect(client.disconnect()).resolves.toBeUndefined();
      expect(mockMqttClient.end).not.toHaveBeenCalled();
    });

    it('should clean up resources after disconnect', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      await client.disconnect();

      expect(mockMqttClient.removeAllListeners).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;
    });

    it('should subscribe to a topic', async () => {
      await client.subscribe('test/topic');

      expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
        'test/topic',
        { qos: 0 },
        expect.any(Function),
      );
      expect(client.getSubscribedTopics()).toContain('test/topic');
    });

    it('should throw error when not connected', async () => {
      await client.disconnect();

      await expect(client.subscribe('test/topic')).rejects.toThrow('Not connected to MQTT broker');
    });

    it('should throw error on subscription failure', async () => {
      mockMqttClient.subscribe.mockImplementationOnce(
        (topic: string, opts: object, callback: (error?: Error) => void) => {
          callback(new Error('Subscription failed'));
        },
      );

      await expect(client.subscribe('test/topic')).rejects.toThrow('Failed to subscribe to test/topic');
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;
      await client.subscribe('test/topic');
    });

    it('should unsubscribe from a topic', async () => {
      await client.unsubscribe('test/topic');

      expect(mockMqttClient.unsubscribe).toHaveBeenCalledWith('test/topic', expect.any(Function));
      expect(client.getSubscribedTopics()).not.toContain('test/topic');
    });

    it('should throw error when not connected', async () => {
      await client.disconnect();

      await expect(client.unsubscribe('test/topic')).rejects.toThrow('Not connected to MQTT broker');
    });

    it('should throw error on unsubscription failure', async () => {
      mockMqttClient.unsubscribe.mockImplementationOnce(
        (topic: string, callback: (error?: Error) => void) => {
          callback(new Error('Unsubscription failed'));
        },
      );

      await expect(client.unsubscribe('test/topic')).rejects.toThrow('Failed to unsubscribe from test/topic');
    });
  });

  describe('publish', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;
    });

    it('should publish a string message', async () => {
      await client.publish('test/topic', 'hello');

      expect(mockMqttClient.publish).toHaveBeenCalledWith(
        'test/topic',
        'hello',
        { qos: 0 },
        expect.any(Function),
      );
    });

    it('should publish an object as JSON', async () => {
      await client.publish('test/topic', { key: 'value' });

      expect(mockMqttClient.publish).toHaveBeenCalledWith(
        'test/topic',
        JSON.stringify({ key: 'value' }),
        { qos: 0 },
        expect.any(Function),
      );
    });

    it('should throw error when not connected', async () => {
      await client.disconnect();

      await expect(client.publish('test/topic', 'hello')).rejects.toThrow('Not connected to MQTT broker');
    });

    it('should throw error on publish failure', async () => {
      mockMqttClient.publish.mockImplementationOnce(
        (topic: string, payload: string, opts: object, callback: (error?: Error) => void) => {
          callback(new Error('Publish failed'));
        },
      );

      await expect(client.publish('test/topic', 'hello')).rejects.toThrow('Failed to publish to test/topic');
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;
    });

    it('should emit message event with parsed JSON', async () => {
      const messageHandler = jest.fn();
      client.on('message', messageHandler);

      const jsonPayload = JSON.stringify({ msg: 'CURRENT-STATE', data: { fpwr: 'ON' } });
      mockMqttClient._emit('message', 'test/topic', Buffer.from(jsonPayload));

      expect(messageHandler).toHaveBeenCalledWith({
        topic: 'test/topic',
        payload: expect.any(Buffer),
        data: { msg: 'CURRENT-STATE', data: { fpwr: 'ON' } },
      });
    });

    it('should emit message event without data for non-JSON payloads', async () => {
      const messageHandler = jest.fn();
      client.on('message', messageHandler);

      mockMqttClient._emit('message', 'test/topic', Buffer.from('not json'));

      expect(messageHandler).toHaveBeenCalledWith({
        topic: 'test/topic',
        payload: expect.any(Buffer),
      });
      expect(messageHandler.mock.calls[0][0]).not.toHaveProperty('data');
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;
    });

    describe('subscribeToStatus', () => {
      it('should subscribe to the device status topic', async () => {
        await client.subscribeToStatus();

        expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
          '438/ABC-AB-12345678/status/current',
          { qos: 0 },
          expect.any(Function),
        );
      });
    });

    describe('publishCommand', () => {
      it('should publish to the device command topic', async () => {
        await client.publishCommand({ msg: 'TEST', data: {} });

        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          '438/ABC-AB-12345678/command',
          JSON.stringify({ msg: 'TEST', data: {} }),
          { qos: 0 },
          expect.any(Function),
        );
      });
    });

    describe('requestCurrentState', () => {
      it('should send REQUEST-CURRENT-STATE message', async () => {
        await client.requestCurrentState();

        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          '438/ABC-AB-12345678/command',
          expect.stringContaining('REQUEST-CURRENT-STATE'),
          { qos: 0 },
          expect.any(Function),
        );

        const publishedPayload = JSON.parse(
          (mockMqttClient.publish as jest.Mock).mock.calls[0][1] as string,
        );
        expect(publishedPayload.msg).toBe('REQUEST-CURRENT-STATE');
        expect(publishedPayload.time).toBeDefined();
      });
    });
  });

  describe('topic getters', () => {
    it('should return correct status topic', () => {
      expect(client.getStatusTopic()).toBe('438/ABC-AB-12345678/status/current');
    });

    it('should return correct command topic', () => {
      expect(client.getCommandTopic()).toBe('438/ABC-AB-12345678/command');
    });
  });

  describe('getters', () => {
    it('should return serial number', () => {
      expect(client.getSerial()).toBe('ABC-AB-12345678');
    });

    it('should return product type', () => {
      expect(client.getProductType()).toBe('438');
    });

    it('should return subscribed topics', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      await client.subscribe('topic1');
      await client.subscribe('topic2');

      const topics = client.getSubscribedTopics();
      expect(topics).toContain('topic1');
      expect(topics).toContain('topic2');
      expect(topics).toHaveLength(2);
    });

    it('should return empty array when no subscriptions', () => {
      expect(client.getSubscribedTopics()).toEqual([]);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('should return true after connection', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      expect(client.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('automatic reconnection', () => {
    it('should emit offline event on disconnect', async () => {
      const offlineHandler = jest.fn();
      client.on('offline', offlineHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Simulate unexpected disconnect
      mockMqttClient._emit('close');

      expect(offlineHandler).toHaveBeenCalled();
    });

    it('should emit reconnect event with attempt number', async () => {
      const reconnectHandler = jest.fn();
      client.on('reconnect', reconnectHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Simulate unexpected disconnect
      mockMqttClient._emit('close');

      expect(reconnectHandler).toHaveBeenCalledWith(1);
    });

    it('should attempt reconnection with exponential backoff', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Simulate disconnect
      mockMqttClient._emit('close');

      // First attempt after 1 second
      expect(mockConnect).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Let promises settle

      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('should emit reconnectFailed after max attempts', async () => {
      const reconnectFailedHandler = jest.fn();
      const reconnectHandler = jest.fn();
      const customClient = new DysonMqttClient(
        { ...defaultOptions, maxReconnectAttempts: 2, timeout: 100 },
        mockConnect,
      );
      customClient.on('reconnectFailed', reconnectFailedHandler);
      customClient.on('reconnect', reconnectHandler);

      const connectPromise = customClient.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // First disconnect triggers reconnect
      mockMqttClient._emit('close');
      expect(reconnectHandler).toHaveBeenCalledWith(1);

      // First reconnect attempt after 1s backoff
      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync().catch(() => {});

      // Simulate failed reconnect (timeout after 100ms)
      jest.advanceTimersByTime(101);
      await jest.runAllTimersAsync().catch(() => {});

      // Second reconnect attempt should now be scheduled
      expect(reconnectHandler).toHaveBeenCalledWith(2);

      // Second reconnect after 2s backoff
      jest.advanceTimersByTime(2000);
      await jest.runAllTimersAsync().catch(() => {});

      // Second reconnect fails (timeout)
      jest.advanceTimersByTime(101);
      await jest.runAllTimersAsync().catch(() => {});

      // Max attempts (2) reached, should emit reconnectFailed
      expect(reconnectFailedHandler).toHaveBeenCalled();
    });

    it('should not reconnect when autoReconnect is disabled', async () => {
      const reconnectHandler = jest.fn();
      const customClient = new DysonMqttClient(
        { ...defaultOptions, autoReconnect: false },
        mockConnect,
      );
      customClient.on('reconnect', reconnectHandler);

      const connectPromise = customClient.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Simulate disconnect
      mockMqttClient._emit('close');

      // Advance time
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(reconnectHandler).not.toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect after intentional disconnect', async () => {
      const reconnectHandler = jest.fn();
      client.on('reconnect', reconnectHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Intentional disconnect
      await client.disconnect();

      // Advance time
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(reconnectHandler).not.toHaveBeenCalled();
    });

    it('should reset attempt count on successful reconnect', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      expect(client.getReconnectAttempts()).toBe(0);

      // Simulate disconnect
      mockMqttClient._emit('close');

      // First reconnect attempt
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Simulate successful reconnection
      mockMqttClient._emit('connect');
      await Promise.resolve();

      expect(client.getReconnectAttempts()).toBe(0);
      expect(client.isReconnectingState()).toBe(false);
    });

    it('should re-subscribe to topics after reconnection', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Subscribe to topics
      await client.subscribe('topic1');
      await client.subscribe('topic2');

      // Clear mock calls
      mockMqttClient.subscribe.mockClear();

      // Simulate disconnect
      mockMqttClient._emit('close');

      // Reconnect
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Simulate successful reconnection
      mockMqttClient._emit('connect');
      await Promise.resolve();

      // Should re-subscribe
      expect(mockMqttClient.subscribe).toHaveBeenCalledTimes(2);
    });

    it('should preserve subscribed topics during reconnection', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      await client.subscribe('topic1');

      // Simulate disconnect (but not intentional)
      mockMqttClient._emit('close');

      // Topics should still be tracked
      expect(client.getSubscribedTopics()).toContain('topic1');
    });

    it('should clear subscribed topics on intentional disconnect', async () => {
      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      await client.subscribe('topic1');

      // Intentional disconnect
      await client.disconnect();

      expect(client.getSubscribedTopics()).toEqual([]);
    });
  });

  describe('reconnection state getters', () => {
    it('should return reconnect attempts', async () => {
      expect(client.getReconnectAttempts()).toBe(0);
    });

    it('should return reconnecting state', () => {
      expect(client.isReconnectingState()).toBe(false);
    });
  });
});
