# Devices

Device abstraction layer - Represents Dyson devices and manages their state and communication.

## Structure

```
devices/
├── index.ts           # Module exports
├── types.ts           # Device type definitions
├── deviceFactory.ts   # Factory for creating device instances
├── deviceManager.ts   # Discovery and connection orchestration
├── dysonDevice.ts     # Base abstract device class
└── dysonLinkDevice.ts # MQTT-based device implementation
```

## Files

### types.ts
Core type definitions:
- `DeviceInfo`: Discovery data (serial, product type, credentials, IP)
- `DeviceState`: Complete device status (power, sensors, filters, etc.)
- `DeviceFeatures`: Capability flags for a device model
- `DeviceEvents`: EventEmitter interface (connect, disconnect, stateChange, error)

### deviceFactory.ts
Factory pattern for creating the correct device type:
- Validates product type against device catalog
- Creates `DysonLinkDevice` for all supported devices

### deviceManager.ts
Orchestrates device discovery and connection:
- **Cloud API + mDNS mode**: Retrieves device list from Dyson cloud, discovers IPs via mDNS
- **Manual mode**: Uses manually configured credentials and IPs
- Returns discovery results with success/failure counts

### dysonDevice.ts
Abstract base class for all Dyson devices:
- Extends `EventEmitter`
- Methods: `connect()`, `disconnect()`, `setState()`, `sendCommand()`, `getState()`
- Emits: connect, disconnect, stateChange, error

### dysonLinkDevice.ts
Concrete implementation using MQTT protocol:
- MQTT connection setup and management
- Message encoding/decoding via `MessageCodec`
- State synchronization from device messages
- Reconnection logic with exponential backoff

## Design Patterns

- **Factory Pattern**: `deviceFactory.ts` creates appropriate device instances
- **Observer Pattern**: Devices emit events for state changes
- **Dependency Injection**: MQTT client factories for testability
