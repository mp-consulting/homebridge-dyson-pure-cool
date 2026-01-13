# Epic 3: Core Fan Control

| Field | Value |
|-------|-------|
| **Epic ID** | E3 |
| **Title** | Core Fan Control |
| **Priority** | P0 (Critical Path) |
| **Estimated Points** | 10 |
| **Status** | Ready |

---

## Description

Implement core fan control functionality including power, speed, and oscillation. This epic delivers the primary user value - controlling Dyson fans via HomeKit.

## Value Statement

Fan control is the primary reason users install this plugin. Without it, the plugin provides no meaningful value.

## Acceptance Criteria

- [ ] Fan appears as Fanv2 accessory in HomeKit
- [ ] Power on/off works via HomeKit
- [ ] Fan speed adjustable 0-100% (maps to 1-10)
- [ ] Oscillation toggle works
- [ ] State syncs from device to HomeKit within 2s
- [ ] Commands execute within 500ms

## Dependencies

- Epic 1: Project Infrastructure (complete)
- Epic 2: Device Discovery & Connection (complete)

## Technical Notes

Refer to architecture document for:
- Accessory layer (`DysonAccessory`, `FanService`)
- Protocol encoding (`messageCodec.ts`)
- HomeKit Fanv2 service characteristics

---

## Stories

### E3-S1: Implement Base Device Class

| Field | Value |
|-------|-------|
| **Story ID** | E3-S1 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want a base device class so that common functionality is shared across device types.

#### Acceptance Criteria
- [ ] `DysonDevice` abstract class created
- [ ] Holds MQTT client reference
- [ ] Manages device state
- [ ] Emits `stateChange` events
- [ ] Abstract methods for device-specific logic
- [ ] Connects/disconnects cleanly

#### Technical Notes
```typescript
abstract class DysonDevice extends EventEmitter {
  abstract readonly productType: string;
  protected state: DeviceState;

  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  protected abstract handleMessage(payload: Buffer): void;
}
```

#### Files to Create/Modify
- `src/devices/dysonDevice.ts` - Create
- `src/devices/types.ts` - State types

---

### E3-S2: Implement Message Codec

| Field | Value |
|-------|-------|
| **Story ID** | E3-S2 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want a message codec so that Dyson protocol messages are encoded/decoded consistently.

#### Acceptance Criteria
- [ ] `MessageCodec` class created
- [ ] Encodes fan commands (power, speed, oscillation)
- [ ] Decodes state messages
- [ ] Handles `CURRENT-STATE` and `STATE-CHANGE` message types
- [ ] Proper timestamp formatting
- [ ] Unit tests for encode/decode

#### Technical Notes
```typescript
class MessageCodec {
  encodeCommand(data: Partial<CommandData>): string;
  decodeState(payload: Buffer): Partial<DeviceState>;
}
```

Fan speed encoding: 50% → `"fnsp": "0005"`

#### Files to Create/Modify
- `src/protocol/messageCodec.ts` - Create
- `test/unit/protocol/messageCodec.test.ts` - Tests

---

### E3-S3: Implement Pure Cool Device

| Field | Value |
|-------|-------|
| **Story ID** | E3-S3 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want a Pure Cool device class so that TP-series devices are properly supported.

#### Acceptance Criteria
- [ ] `PureCoolDevice` extends `DysonDevice`
- [ ] Product types: 438, 438E (TP04, TP07)
- [ ] Implements fan control methods
- [ ] Handles state updates
- [ ] Supports all TP-series features

#### Technical Notes
```typescript
class PureCoolDevice extends DysonDevice {
  readonly productType = '438'; // or '438E'

  async setFanPower(on: boolean): Promise<void>;
  async setFanSpeed(speed: number): Promise<void>;
  async setOscillation(on: boolean): Promise<void>;
}
```

#### Files to Create/Modify
- `src/devices/pureCoolDevice.ts` - Create

---

### E3-S4: Implement Fanv2 Service Handler

| Field | Value |
|-------|-------|
| **Story ID** | E3-S4 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a user, I want my fan to appear correctly in HomeKit so that I can control it with Siri and the Home app.

#### Acceptance Criteria
- [ ] `FanService` class created
- [ ] Uses HomeKit Fanv2 service
- [ ] Active characteristic (on/off)
- [ ] RotationSpeed characteristic (0-100%)
- [ ] SwingMode characteristic (oscillation)
- [ ] Get/Set handlers implemented
- [ ] Updates characteristics on state change

#### Technical Notes
```typescript
class FanService {
  constructor(accessory: PlatformAccessory, device: DysonDevice);

  private handleActiveGet(): CharacteristicValue;
  private handleActiveSet(value: CharacteristicValue): void;
  private handleSpeedGet(): CharacteristicValue;
  private handleSpeedSet(value: CharacteristicValue): void;
}
```

#### Files to Create/Modify
- `src/accessories/services/fanService.ts` - Create

---

### E3-S5: Implement Base Accessory Class

| Field | Value |
|-------|-------|
| **Story ID** | E3-S5 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a developer, I want a base accessory class so that common accessory logic is shared.

#### Acceptance Criteria
- [ ] `DysonAccessory` abstract class created
- [ ] Holds platform and accessory references
- [ ] Holds device reference
- [ ] Sets up AccessoryInformation service
- [ ] Abstract method for setting up services
- [ ] Subscribes to device state changes

#### Technical Notes
```typescript
abstract class DysonAccessory {
  protected readonly platform: DysonPureCoolPlatform;
  protected readonly accessory: PlatformAccessory;
  protected readonly device: DysonDevice;

  protected abstract setupServices(): void;
}
```

#### Files to Create/Modify
- `src/accessories/dysonAccessory.ts` - Create

---

### E3-S6: Implement Pure Cool Accessory

| Field | Value |
|-------|-------|
| **Story ID** | E3-S6 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a user, I want my Pure Cool device properly represented in HomeKit so that all features are accessible.

#### Acceptance Criteria
- [ ] `PureCoolAccessory` extends `DysonAccessory`
- [ ] Creates FanService
- [ ] Registers with platform
- [ ] Updates services on state change
- [ ] Handles device disconnect (shows Not Responding)

#### Technical Notes
```typescript
class PureCoolAccessory extends DysonAccessory {
  private fanService: FanService;

  protected setupServices(): void {
    this.fanService = new FanService(this.accessory, this.device);
  }
}
```

#### Files to Create/Modify
- `src/accessories/pureCoolAccessory.ts` - Create
