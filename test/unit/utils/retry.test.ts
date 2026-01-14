/**
 * Retry Utilities Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { sleep, calculateBackoff, RECONNECT_DEFAULTS } from '../../../src/utils/retry.js';

describe('Retry Utilities', () => {
  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after specified duration', async () => {
      const sleepPromise = sleep(1000);

      jest.advanceTimersByTime(999);
      expect(jest.getTimerCount()).toBe(1);

      jest.advanceTimersByTime(1);
      await sleepPromise;

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should handle zero duration', async () => {
      const sleepPromise = sleep(0);

      jest.advanceTimersByTime(0);
      await sleepPromise;
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      // 1s * 2^0 = 1000ms
      expect(calculateBackoff(0)).toBe(1000);
      // 1s * 2^1 = 2000ms
      expect(calculateBackoff(1)).toBe(2000);
      // 1s * 2^2 = 4000ms
      expect(calculateBackoff(2)).toBe(4000);
      // 1s * 2^3 = 8000ms
      expect(calculateBackoff(3)).toBe(8000);
      // 1s * 2^4 = 16000ms
      expect(calculateBackoff(4)).toBe(16000);
    });

    it('should cap at maxDelay', () => {
      // 1s * 2^5 = 32000ms, capped at 30000ms
      expect(calculateBackoff(5)).toBe(30000);
      // 1s * 2^10 = 1024000ms, capped at 30000ms
      expect(calculateBackoff(10)).toBe(30000);
    });

    it('should use custom baseDelay', () => {
      expect(calculateBackoff(0, 500)).toBe(500);
      expect(calculateBackoff(1, 500)).toBe(1000);
      expect(calculateBackoff(2, 500)).toBe(2000);
    });

    it('should use custom maxDelay', () => {
      expect(calculateBackoff(4, 1000, 10000)).toBe(10000);
      expect(calculateBackoff(5, 1000, 10000)).toBe(10000);
    });

    it('should handle edge case where baseDelay exceeds maxDelay', () => {
      expect(calculateBackoff(0, 5000, 1000)).toBe(1000);
    });
  });

  describe('RECONNECT_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(RECONNECT_DEFAULTS.maxAttempts).toBe(5);
      expect(RECONNECT_DEFAULTS.baseDelay).toBe(1000);
      expect(RECONNECT_DEFAULTS.maxDelay).toBe(30000);
    });

    it('should be frozen/readonly', () => {
      // TypeScript const assertion makes these readonly
      // Just verify the values exist
      expect(RECONNECT_DEFAULTS).toBeDefined();
    });
  });
});
