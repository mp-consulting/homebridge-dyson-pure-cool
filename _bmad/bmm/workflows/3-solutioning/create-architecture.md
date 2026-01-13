# Workflow: Create Architecture Document

**Agent:** Architect
**Shortcut:** `*create-architecture` or `CA`
**Phase:** 3 - Solutioning

## Purpose

Design the technical architecture for the homebridge-dyson-pure-cool plugin, ensuring it meets all PRD requirements while following Homebridge best practices.

## Architecture Document Structure

### 1. System Overview
- High-level architecture diagram
- Component relationships
- Data flow overview

### 2. Component Architecture

#### Platform Plugin Core
- `index.ts` - Plugin registration
- `platform.ts` - Platform class (DynamicPlatformPlugin)
- `platformAccessory.ts` - Accessory handling

#### Device Communication Layer
- `dyson/client.ts` - MQTT client wrapper
- `dyson/discovery.ts` - Device discovery
- `dyson/protocol.ts` - Message encoding/decoding
- `dyson/authentication.ts` - Credential handling

#### HomeKit Mapping Layer
- `accessories/fan.ts` - Fan accessory
- `accessories/airQualitySensor.ts` - Air quality sensor
- `accessories/temperatureSensor.ts` - Temperature sensor
- `accessories/humiditySensor.ts` - Humidity sensor

#### Configuration
- `config.ts` - Configuration types and validation
- `settings.ts` - Constants and defaults

### 3. Data Models

```typescript
interface DysonDevice {
  serialNumber: string;
  productType: string;
  name: string;
  credentials: DeviceCredentials;
}

interface DeviceState {
  fanSpeed: number;
  oscillation: boolean;
  nightMode: boolean;
  autoMode: boolean;
  airQuality: number;
  temperature: number;
  humidity: number;
}
```

### 4. Communication Flow
1. Plugin initializes
2. Device discovery runs (local network)
3. MQTT connections established
4. State synchronized to HomeKit
5. Commands forwarded to devices

### 5. Error Handling Strategy
- Connection retry with backoff
- Graceful degradation
- State caching for offline periods
- Meaningful error logging

### 6. Testing Strategy
- Unit tests for protocol handling
- Integration tests with mock devices
- Manual testing checklist

### 7. Configuration Schema
- Required vs optional fields
- Validation rules
- Default values

## Outputs
- `_bmad-output/planning/architecture.md`
- Component diagrams
- Data model definitions

## Next Steps
- Run `*design-device-layer` for Dyson specifics
- Run `*design-homekit-mapping` for HomeKit details
- Return to PM for `*create-epics`
