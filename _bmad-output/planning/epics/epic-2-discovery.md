# Epic 2: Device Discovery & Connection

| Field | Value |
|-------|-------|
| **Epic ID** | E2 |
| **Title** | Device Discovery & Connection |
| **Priority** | P0 (Critical Path) |
| **Estimated Points** | 13 |
| **Status** | Ready |

---

## Description

Implement device discovery via Dyson cloud API and local mDNS, establish MQTT connections to devices, and handle credentials securely. This epic creates the foundation for all device communication.

## Value Statement

Users need their Dyson devices discovered and connected automatically. Without reliable discovery and connection, no control features can work.

## Acceptance Criteria

- [ ] Plugin can authenticate with Dyson cloud API
- [ ] Device list retrieved from cloud
- [ ] Devices discovered on local network via mDNS
- [ ] MQTT connection established to each device
- [ ] Automatic reconnection on disconnect
- [ ] Manual credential entry works as fallback
- [ ] Credentials cached for restart survival

## Dependencies

- Epic 1: Project Infrastructure (complete)

## Technical Notes

Refer to architecture document for:
- Discovery layer components (`cloudApi.ts`, `mdnsDiscovery.ts`)
- MQTT client with reconnection (`mqttClient.ts`)
- Credential management

---

## Stories

### E2-S1: Implement Dyson Cloud API Client

| Field | Value |
|-------|-------|
| **Story ID** | E2-S1 |
| **Points** | 3 |
| **Priority** | P0 |

#### User Story
As a user, I want to enter my Dyson credentials so that the plugin can discover my devices automatically.

#### Acceptance Criteria
- [ ] `DysonCloudApi` class created
- [ ] Authentication with email/password works
- [ ] Device list retrieved with serial, product type, name
- [ ] Local credentials extracted for each device
- [ ] Handles authentication errors gracefully
- [ ] Rate limiting respected

#### Technical Notes
```typescript
class DysonCloudApi {
  async authenticate(email: string, password: string): Promise<void>;
  async getDevices(): Promise<DeviceInfo[]>;
}
```

API endpoints:
- Auth: `POST /v3/userregistration/email/auth`
- Devices: `GET /v2/provisioningservice/manifest`

#### Files to Create/Modify
- `src/discovery/cloudApi.ts` - Create
- `src/discovery/types.ts` - Types

---

### E2-S2: Implement mDNS Discovery

| Field | Value |
|-------|-------|
| **Story ID** | E2-S2 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a user, I want my devices auto-discovered on the network so that I don't need to enter IP addresses.

#### Acceptance Criteria
- [ ] `MdnsDiscovery` class created
- [ ] Discovers `_dyson_mqtt._tcp` services
- [ ] Extracts serial number from service name
- [ ] Maps serial → IP address
- [ ] Configurable timeout (default 10s)
- [ ] Handles no devices found gracefully

#### Technical Notes
```typescript
class MdnsDiscovery {
  async discover(timeout?: number): Promise<Map<string, string>>;
}
```

Use `bonjour-service` package.

#### Files to Create/Modify
- `src/discovery/mdnsDiscovery.ts` - Create

---

### E2-S3: Implement MQTT Client Wrapper

| Field | Value |
|-------|-------|
| **Story ID** | E2-S3 |
| **Points** | 3 |
| **Priority** | P0 |

#### User Story
As a developer, I want an MQTT client wrapper so that device communication is reliable and consistent.

#### Acceptance Criteria
- [ ] `MqttClient` class wraps `mqtt` package
- [ ] Connect with credentials (serial as username)
- [ ] Subscribe to status topic
- [ ] Publish to command topic
- [ ] Emit events for messages
- [ ] Handle connection errors

#### Technical Notes
```typescript
class MqttClient extends EventEmitter {
  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async subscribe(topic: string): Promise<void>;
  async publish(topic: string, message: string): Promise<void>;
}
```

Topics:
- Status: `{productType}/{serial}/status/current`
- Command: `{productType}/{serial}/command`

#### Files to Create/Modify
- `src/protocol/mqttClient.ts` - Create

---

### E2-S4: Implement Automatic Reconnection

| Field | Value |
|-------|-------|
| **Story ID** | E2-S4 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a user, I want the plugin to reconnect automatically if connection is lost so that I don't need to restart Homebridge.

#### Acceptance Criteria
- [ ] Reconnection triggered on disconnect
- [ ] Exponential backoff (1s, 2s, 4s, 8s, 16s)
- [ ] Maximum 5 reconnection attempts
- [ ] Emits event on permanent failure
- [ ] Resets attempt count on successful connect
- [ ] Device marked offline during reconnection

#### Technical Notes
```typescript
private async handleDisconnect(): Promise<void> {
  if (this.reconnectAttempts < 5) {
    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    await sleep(delay);
    await this.connect();
  }
}
```

#### Files to Create/Modify
- `src/protocol/mqttClient.ts` - Add reconnection
- `src/utils/retry.ts` - Retry utilities

---

### E2-S5: Implement Manual Credential Entry

| Field | Value |
|-------|-------|
| **Story ID** | E2-S5 |
| **Points** | 1 |
| **Priority** | P1 |

#### User Story
As a user with 2FA enabled, I want to manually enter device credentials so that I can use the plugin without cloud authentication.

#### Acceptance Criteria
- [ ] Config accepts `devices[]` array
- [ ] Each device can have: serial, credentials, ipAddress, name
- [ ] Manual devices skip cloud API
- [ ] Manual devices skip mDNS discovery
- [ ] Validates required fields

#### Technical Notes
```typescript
interface ManualDeviceConfig {
  serial: string;
  credentials: string;
  ipAddress: string;
  name?: string;
}
```

#### Files to Create/Modify
- `src/config.ts` - Add manual device types
- `src/platform.ts` - Handle manual config

---

### E2-S6: Implement Device Manager

| Field | Value |
|-------|-------|
| **Story ID** | E2-S6 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want a device manager so that multiple device connections are handled consistently.

#### Acceptance Criteria
- [ ] `DeviceManager` class created
- [ ] Orchestrates cloud API + mDNS discovery
- [ ] Creates appropriate device instance per product type
- [ ] Connects all devices
- [ ] Provides access to devices by serial
- [ ] Handles partial failures (some devices connect)

#### Technical Notes
```typescript
class DeviceManager {
  async discoverAndConnect(): Promise<DysonDevice[]>;
  getDevice(serial: string): DysonDevice | undefined;
  getAllDevices(): DysonDevice[];
}
```

#### Files to Create/Modify
- `src/devices/deviceManager.ts` - Create
