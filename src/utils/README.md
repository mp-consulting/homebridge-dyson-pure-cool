# Utils

Utility functions for the plugin.

## Structure

```
utils/
├── index.ts   # Module exports
└── retry.ts   # Retry and backoff utilities
```

## Files

### retry.ts
Retry logic and connection management utilities.

**Exports:**
- `sleep(ms)`: Promise-based delay function
- `calculateBackoff(attempt, config)`: Exponential backoff calculation
- `RECONNECT_DEFAULTS`: Default reconnection configuration
  - Initial delay
  - Maximum delay
  - Maximum attempts

Used primarily for MQTT reconnection logic when device connections are lost.
