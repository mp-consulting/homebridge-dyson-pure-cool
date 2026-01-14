/**
 * Retry and backoff utilities
 */

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 *
 * Formula: baseDelay * 2^attempt (clamped to maxDelay)
 *
 * @param attempt - Current attempt number (0-based)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay in milliseconds (default: 30000)
 * @returns Delay in milliseconds
 *
 * @example
 * ```typescript
 * calculateBackoff(0) // 1000ms (1s)
 * calculateBackoff(1) // 2000ms (2s)
 * calculateBackoff(2) // 4000ms (4s)
 * calculateBackoff(3) // 8000ms (8s)
 * calculateBackoff(4) // 16000ms (16s)
 * calculateBackoff(5) // 30000ms (capped at maxDelay)
 * ```
 */
export function calculateBackoff(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000,
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Default reconnection settings
 */
export const RECONNECT_DEFAULTS = {
  /** Maximum number of reconnection attempts */
  maxAttempts: 5,
  /** Base delay for exponential backoff (1 second) */
  baseDelay: 1000,
  /** Maximum delay between attempts (30 seconds) */
  maxDelay: 30000,
} as const;
