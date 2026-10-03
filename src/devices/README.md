# Devices

Device abstraction layer - Represents Dyson devices and manages their state and communication.

## Structure

```
devices/
├── index.ts           # Module exports
├── types.ts           # Device type definitions
├── deviceFactory.ts   # Factory for creating device instances
├── dysonDevice.ts     # Base abstract device class
└── dysonLinkDevice.ts # MQTT-based device implementation
```

## Files

### types.ts
Core type definitions:
- `DeviceInfo`: Discovery data (serial, product type, credentials, IP)
- `DeviceState`: Complete device status (power, sensors, filters, etc.)
- `DeviceFeatures`: Capability flags for a device model
- `DeviceEvents`: EventEmitter interface (connect, disconnect, stateChange, error, reconnectFailed)

### deviceFactory.ts
Factory pattern for creating the correct device type:
- Validates product type against device catalog
- Creates `DysonLinkDevice` for all supported devices

### dysonDevice.ts
Abstract base class for all Dyson devices:
- Extends `EventEmitter`
- Methods: `connect()`, `disconnect()`, `sendCommand()`, `getState()`, `setIpAddress()`
- Emits: connect, disconnect, stateChange (only when a field changed), error, reconnectFailed

### dysonLinkDevice.ts
Concrete implementation using MQTT protocol:
- MQTT connection setup and management
- Message encoding/decoding via `MessageCodec`
- State synchronization from device messages
- Commands from the same tick are batched into one MQTT message; setters
  resolve once it is published and reject if publishing fails

## Design Patterns

- **Factory Pattern**: `deviceFactory.ts` creates appropriate device instances
- **Observer Pattern**: Devices emit events for state changes
- **Dependency Injection**: MQTT client factories for testability
