# Epic 3: Core Fan Control

| Field | Value |
|-------|-------|
| **Epic ID** | E3 |
| **Title** | Core Fan Control |
| **Priority** | P0 (Critical Path) |
| **Estimated Points** | 11 |
| **Status** | Complete ✅ |
| **Completed** | E3-S1, E3-S2, E3-S3, E3-S4, E3-S5, E3-S6 (11 pts) |
| **Remaining** | None |

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

### E3-S1: Implement Base Device Class ✅

| Field | Value |
|-------|-------|
| **Story ID** | E3-S1 |
| **Points** | 2 |
| **Priority** | P0 |
| **Status** | Complete |

#### User Story
As a developer, I want a base device class so that common functionality is shared across device types.

#### Acceptance Criteria
- [x] `DysonDevice` abstract class created
- [x] Holds MQTT client reference
- [x] Manages device state
- [x] Emits `stateChange` events
- [x] Abstract methods for device-specific logic
- [x] Connects/disconnects cleanly

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

### E3-S2: Implement Message Codec ✅

| Field | Value |
|-------|-------|
| **Story ID** | E3-S2 |
| **Points** | 2 |
| **Priority** | P0 |
| **Status** | Complete |

#### User Story
As a developer, I want a message codec so that Dyson protocol messages are encoded/decoded consistently.

#### Acceptance Criteria
- [x] `MessageCodec` class created
- [x] Encodes fan commands (power, speed, oscillation)
- [x] Decodes state messages
- [x] Handles `CURRENT-STATE` and `STATE-CHANGE` message types
- [x] Proper timestamp formatting
- [x] Unit tests for encode/decode

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

### E3-S3: Implement Link Device (Fan-only base)

| Field | Value |
|-------|-------|
| **Story ID** | E3-S3 |
| **Points** | 3 |
| **Priority** | P0 |
| **Status** | Ready |

#### User Story
As a developer, I want a Link device class so that older "Link" series devices (455, 438, etc.) are properly supported with fan control.

#### Acceptance Criteria
- [ ] `DysonLinkDevice` extends `DysonDevice`
- [ ] Product types: 455 (HP02), 438 (TP04), 438E (TP07)
- [ ] Implements fan control methods (power, speed, oscillation)
- [ ] Handles state updates via `handleStateMessage`
- [ ] Device factory function to create correct device by product type
- [ ] Unit tests for state parsing and command encoding

#### Technical Notes
```typescript
class DysonLinkDevice extends DysonDevice {
  readonly productType: string;
  readonly supportedFeatures: DeviceFeatures;

  async setFanPower(on: boolean): Promise<void>;
  async setFanSpeed(speed: number): Promise<void>;
  async setOscillation(on: boolean): Promise<void>;

  protected handleStateMessage(data: Record<string, unknown>): void;
}

// Factory function
function createDevice(info: DeviceInfo): DysonDevice {
  switch (info.productType) {
    case '455': // HP02 - has heating (handled in E5)
    case '438': // TP04
    case '438E': // TP07
      return new DysonLinkDevice(info);
    default:
      throw new Error(`Unsupported product type: ${info.productType}`);
  }
}
```

#### Supported Product Types (confirmed via API capture 2026-01-13)
| Type | Model | Notes |
|------|-------|-------|
| 455 | HP02 (Pure Hot+Cool Link) | Has heating capability (E5) |
| 438 | TP04 (Pure Cool Tower) | Fan + AQ sensors |
| 438E | TP07 (Purifier Cool) | Fan + AQ + HEPA |

#### Files to Create/Modify
- `src/devices/dysonLinkDevice.ts` - Create
- `src/devices/deviceFactory.ts` - Create
- `src/devices/index.ts` - Update exports
- `test/unit/devices/dysonLinkDevice.test.ts` - Create

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

### E3-S6: Implement Dyson Link Accessory

| Field | Value |
|-------|-------|
| **Story ID** | E3-S6 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a user, I want my Dyson Link device properly represented in HomeKit so that all features are accessible.

#### Acceptance Criteria
- [ ] `DysonLinkAccessory` extends `DysonAccessory`
- [ ] Creates FanService
- [ ] Registers with platform
- [ ] Updates services on state change
- [ ] Handles device disconnect (shows Not Responding)
- [ ] Works with HP02 (455), TP04 (438), TP07 (438E)

#### Technical Notes
```typescript
class DysonLinkAccessory extends DysonAccessory {
  private fanService: FanService;

  protected setupServices(): void {
    this.fanService = new FanService(this.accessory, this.device);
  }
}
```

#### Files to Create/Modify
- `src/accessories/dysonLinkAccessory.ts` - Create
