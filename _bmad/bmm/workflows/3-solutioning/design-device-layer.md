# Workflow: Design Device Communication Layer

**Agent:** Architect
**Shortcut:** `*design-device-layer` or `DL`
**Phase:** 3 - Solutioning

## Purpose

Design the Dyson device communication layer including discovery, authentication, and MQTT messaging.

## Design Components

### 1. Device Discovery

```
┌──────────────────┐     mDNS/Bonjour    ┌──────────────────┐
│   Homebridge     │ ◄─────────────────► │   Dyson Device   │
│   Plugin         │                      │   (Local)        │
└──────────────────┘                      └──────────────────┘
```

- mDNS service type: `_dyson_mqtt._tcp`
- Discovery timeout: configurable
- Caching discovered devices

### 2. Authentication Flow

```
User provides Dyson credentials
         │
         ▼
┌──────────────────┐
│  Dyson Cloud API │ ──► Get device list + local credentials
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  Local MQTT      │ ──► Connect using local credentials
│  Connection      │
└──────────────────┘
```

### 3. MQTT Communication

#### Topics
- Status: `{productType}/{serial}/status/current`
- Command: `{productType}/{serial}/command`

#### Message Format
```json
{
  "msg": "STATE-SET",
  "time": "2024-01-15T10:30:00.000Z",
  "mode-reason": "LAPP",
  "data": {
    "fmod": "FAN",
    "fnsp": "0005"
  }
}
```

### 4. State Management

```typescript
class DysonDevice {
  private state: DeviceState;
  private mqttClient: MqttClient;

  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async sendCommand(command: Command): Promise<void>;
  onStateChange(callback: StateCallback): void;
}
```

### 5. Error Handling

| Error | Action |
|-------|--------|
| Connection lost | Retry with exponential backoff |
| Auth failed | Log error, mark device unavailable |
| Parse error | Log and ignore malformed message |
| Device offline | Cache last state, mark unreachable |

### 6. Device Type Support

| Model | Product Type | Features |
|-------|--------------|----------|
| TP04 | 438 | Fan, Air Quality |
| TP07 | 438E | Fan, Air Quality, HEPA |
| HP04 | 527 | Fan, Heat, Air Quality |
| PH01 | 358 | Fan, Humidify, Air Quality |

## Outputs
- Device layer design document
- Protocol specification
- State machine diagrams

## Next Steps
Proceed to `*design-homekit-mapping` to map device capabilities to HomeKit.
