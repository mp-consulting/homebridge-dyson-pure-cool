/**
 * DysonMqttClient Unit Tests
 */

import { vi, type Mock } from 'vitest';

import {
  DysonMqttClient,
  MQTT_CONNECT_VARIANTS,
  buildClientId,
  isRecoverableConnackError,
} from '../../../src/protocol/mqttClient.js';
import type { MqttConnectFn } from '../../../src/protocol/mqttClient.js';
import type { MqttClient as MqttClientType, IClientOptions } from 'mqtt';

// Create mock MQTT client
function createMockMqttClient() {
  const eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const mockClient = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockClient;
    }),
    end: vi.fn((force?: boolean, opts?: object, callback?: () => void) => {
      if (typeof callback === 'function') {
        callback();
      }
    }),
    subscribe: vi.fn((topic: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    unsubscribe: vi.fn((topic: string, callback: (error?: Error) => void) => {
      callback();
    }),
    publish: vi.fn((topic: string, payload: string, opts: object, callback: (error?: Error) => void) => {
      callback();
    }),
    removeAllListeners: vi.fn(),
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
    vi.useFakeTimers();
    mockMqttClient = createMockMqttClient();
    mockConnect = vi.fn(() => mockMqttClient as unknown as MqttClientType);
    client = new DysonMqttClient(defaultOptions, mockConnect);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('should connect to MQTT broker with correct options', async () => {
      const connectPromise = client.connect();

      // Simulate successful connection
      mockMqttClient._emit('connect');

      await connectPromise;

      expect(mockConnect).toHaveBeenCalledTimes(1);
      const [brokerUrl, options] = (mockConnect as Mock).mock.calls[0] as [string, IClientOptions];
      expect(brokerUrl).toBe('mqtt://192.168.1.100:1883');
      expect(options.username).toBe('ABC-AB-12345678');
      expect(options.password).toBe('localPassword123');
      expect(options.clientId).toContain('homebridge_ABC-AB-12345678_');
      expect(options.keepalive).toBe(30);
      expect(options.connectTimeout).toBe(10000);
      expect(options.protocolVersion).toBe(4);
    });

    it('should emit connect event on successful connection', async () => {
      const connectHandler = vi.fn();
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
      vi.advanceTimersByTime(10001);

      await expect(connectPromise).rejects.toThrow('Connection timeout after 10000ms');
      expect(client.isConnected()).toBe(false);
    });

    it('should use custom timeout when provided', async () => {
      const customClient = new DysonMqttClient(
        { ...defaultOptions, timeout: 5000 },
        mockConnect,
      );

      const connectPromise = customClient.connect();

      vi.advanceTimersByTime(5001);

      await expect(connectPromise).rejects.toThrow('Connection timeout after 5000ms');
    });

    it('should use custom keepalive when provided', async () => {
      const customClient = new DysonMqttClient(
        { ...defaultOptions, keepalive: 60 },
        mockConnect,
      );

      customClient.connect();
      mockMqttClient._emit('connect');

      const [, options] = (mockConnect as Mock).mock.calls[0] as [string, IClientOptions];
      expect(options.keepalive).toBe(60);
    });

    it('should emit error for errors after connection', async () => {
      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      mockMqttClient._emit('error', new Error('Protocol error'));

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should emit disconnect on close after connected', async () => {
      const disconnectHandler = vi.fn();
      const closeHandler = vi.fn();
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
      const disconnectHandler = vi.fn();
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
      const messageHandler = vi.fn();
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
      const messageHandler = vi.fn();
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
          (mockMqttClient.publish as Mock).mock.calls[0][1] as string,
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
      const offlineHandler = vi.fn();
      client.on('offline', offlineHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Simulate unexpected disconnect
      mockMqttClient._emit('close');

      expect(offlineHandler).toHaveBeenCalled();
    });

    it('should emit reconnect event with attempt number', async () => {
      const reconnectHandler = vi.fn();
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

      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Let promises settle

      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('should emit reconnectFailed after max attempts', async () => {
      const reconnectFailedHandler = vi.fn();
      const reconnectHandler = vi.fn();
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
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync().catch(() => {});

      // Simulate failed reconnect (timeout after 100ms)
      vi.advanceTimersByTime(101);
      await vi.runAllTimersAsync().catch(() => {});

      // Second reconnect attempt should now be scheduled
      expect(reconnectHandler).toHaveBeenCalledWith(2);

      // Second reconnect after 2s backoff
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync().catch(() => {});

      // Second reconnect fails (timeout)
      vi.advanceTimersByTime(101);
      await vi.runAllTimersAsync().catch(() => {});

      // Max attempts (2) reached, should emit reconnectFailed
      expect(reconnectFailedHandler).toHaveBeenCalled();
    });

    it('should not reconnect when autoReconnect is disabled', async () => {
      const reconnectHandler = vi.fn();
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
      vi.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(reconnectHandler).not.toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect after intentional disconnect', async () => {
      const reconnectHandler = vi.fn();
      client.on('reconnect', reconnectHandler);

      const connectPromise = client.connect();
      mockMqttClient._emit('connect');
      await connectPromise;

      // Intentional disconnect
      await client.disconnect();

      // Advance time
      vi.advanceTimersByTime(10000);
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
      vi.advanceTimersByTime(1000);
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
      vi.advanceTimersByTime(1000);
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

  describe('connect variant fallback', () => {
    /**
     * Returns a mqttConnect factory that hands out a fresh mock client on each
     * call, so tests can target events at a specific variant attempt.
     */
    function makeConnectSequence() {
      const clients: ReturnType<typeof createMockMqttClient>[] = [];
      const optionsLog: IClientOptions[] = [];
      const connectFn = vi.fn((_brokerUrl: string, options: IClientOptions) => {
        optionsLog.push(options);
        const c = createMockMqttClient();
        clients.push(c);
        return c as unknown as MqttClientType;
      });
      return { connectFn: connectFn as unknown as MqttConnectFn, clients, optionsLog };
    }

    it('uses the default variant on first success and does not escalate', async () => {
      const { connectFn, clients, optionsLog } = makeConnectSequence();
      const c = new DysonMqttClient(defaultOptions, connectFn);

      const promise = c.connect();
      clients[0]._emit('connect');
      await promise;

      expect(clients.length).toBe(1);
      expect(optionsLog[0].clientId).toContain('homebridge_ABC-AB-12345678_');
      expect(optionsLog[0].protocolVersion).toBe(4);
      expect(optionsLog[0].clean).toBe(true);
      expect(c.getActiveVariant()?.label).toBe('default');
    });

    it('escalates to the next variant when CONNACK returns Identifier rejected', async () => {
      const { connectFn, clients, optionsLog } = makeConnectSequence();
      const c = new DysonMqttClient(defaultOptions, connectFn);

      const promise = c.connect();
      // First variant rejected by the broker
      clients[0]._emit('error', new Error('Connection refused: Identifier rejected'));
      // Wait for the ladder to advance to the next variant
      await vi.advanceTimersByTimeAsync(0);
      // Second variant succeeds
      clients[1]._emit('connect');
      await promise;

      expect(clients.length).toBe(2);
      // Second variant should be the short-id one
      expect(optionsLog[1].clientId).toBe('ABC-AB-12345678');
      expect(optionsLog[1].protocolVersion).toBe(4);
      expect(optionsLog[1].clean).toBe(true);
      expect(c.getActiveVariant()?.label).toBe('short-id');
    });

    it('does not escalate on a non-CONNACK error (timeout)', async () => {
      const { connectFn, clients } = makeConnectSequence();
      const c = new DysonMqttClient(defaultOptions, connectFn);

      const promise = c.connect();
      vi.advanceTimersByTime(10001);

      await expect(promise).rejects.toThrow('Connection timeout after 10000ms');
      expect(clients.length).toBe(1); // No second attempt
      expect(c.getActiveVariant()).toBeNull();
    });

    it('does not escalate on a generic network error (ECONNREFUSED)', async () => {
      const { connectFn, clients } = makeConnectSequence();
      const c = new DysonMqttClient(defaultOptions, connectFn);

      const promise = c.connect();
      clients[0]._emit('error', new Error('connect ECONNREFUSED 192.168.1.100:1883'));

      await expect(promise).rejects.toThrow(/ECONNREFUSED/);
      expect(clients.length).toBe(1);
      expect(c.getActiveVariant()).toBeNull();
    });

    it('exhausts the full ladder when every variant is rejected at CONNACK', async () => {
      const { connectFn, clients } = makeConnectSequence();
      const c = new DysonMqttClient(defaultOptions, connectFn);

      const promise = c.connect();
      // Reject each variant in turn
      for (let i = 0; i < MQTT_CONNECT_VARIANTS.length; i++) {
        // Wait for the i-th client to exist, then reject it
        while (clients.length < i + 1) {
          await vi.advanceTimersByTimeAsync(0);
        }
        clients[i]._emit('error', new Error('Connection refused: Identifier rejected'));
      }

      await expect(promise).rejects.toThrow(/Identifier rejected/);
      expect(clients.length).toBe(MQTT_CONNECT_VARIANTS.length);
      expect(c.getActiveVariant()).toBeNull();
    });

    it('reconnects start from the cached successful variant (sticky cache)', async () => {
      const { connectFn, clients, optionsLog } = makeConnectSequence();
      const c = new DysonMqttClient(defaultOptions, connectFn);

      // Initial connect: default rejects, short-id succeeds
      const first = c.connect();
      clients[0]._emit('error', new Error('Connection refused: Identifier rejected'));
      await vi.advanceTimersByTimeAsync(0);
      clients[1]._emit('connect');
      await first;
      expect(c.getActiveVariant()?.label).toBe('short-id');

      // Simulate a transient disconnect (cleanup() happens internally) by tearing
      // down the connection state without an intentional disconnect.
      clients[1]._emit('close');

      // Trigger a fresh connect — the cache should make us try short-id first
      // (no need to re-discover that 'default' is rejected).
      const second = c.connect();
      // No more await needed before _emit because the loop kicks off mqttConnect
      // synchronously inside the first iteration.
      clients[2]._emit('connect');
      await second;

      // 3 connections total: default(fail), short-id(succeed), short-id(succeed)
      expect(clients.length).toBe(3);
      expect(optionsLog[2].clientId).toBe('ABC-AB-12345678');
      expect(c.getActiveVariant()?.label).toBe('short-id');
    });
  });

  describe('isRecoverableConnackError', () => {
    it('matches "Identifier rejected"', () => {
      expect(isRecoverableConnackError(new Error('Connection refused: Identifier rejected'))).toBe(true);
    });

    it('matches "Unacceptable protocol version"', () => {
      expect(isRecoverableConnackError(new Error('Connection refused: Unacceptable protocol version'))).toBe(true);
    });

    it('matches "Bad username or password"', () => {
      expect(isRecoverableConnackError(new Error('Connection refused: Bad username or password'))).toBe(true);
    });

    it('matches "Not authorized"', () => {
      expect(isRecoverableConnackError(new Error('Connection refused: Not authorized'))).toBe(true);
    });

    it('does not match a bare "Connection refused"', () => {
      // This is what ECONNREFUSED at the socket layer typically looks like —
      // it is NOT a CONNACK rejection and should not escalate the ladder.
      expect(isRecoverableConnackError(new Error('connect ECONNREFUSED 192.168.1.100:1883'))).toBe(false);
    });

    it('does not match timeout errors', () => {
      expect(isRecoverableConnackError(new Error('Connection timeout after 10000ms'))).toBe(false);
    });
  });

  describe('buildClientId', () => {
    it('default strategy includes a timestamp', () => {
      const id = buildClientId('default', 'ABC-AB-12345678');
      expect(id).toMatch(/^homebridge_ABC-AB-12345678_\d+$/);
    });

    it('short strategy is just the serial', () => {
      expect(buildClientId('short', 'ABC-AB-12345678')).toBe('ABC-AB-12345678');
    });
  });
});
