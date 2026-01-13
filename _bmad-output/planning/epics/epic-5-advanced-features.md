# Epic 5: Advanced Fan Features

| Field | Value |
|-------|-------|
| **Epic ID** | E5 |
| **Title** | Advanced Fan Features |
| **Priority** | P1 |
| **Estimated Points** | 5 |
| **Status** | Ready |

---

## Description

Implement advanced fan features including auto mode, night mode, and oscillation angle control. These features enhance the user experience beyond basic fan control.

## Value Statement

Advanced features differentiate this plugin and provide users with the full capabilities of their Dyson devices through HomeKit.

## Acceptance Criteria

- [ ] Auto mode toggle works
- [ ] Night mode toggle works
- [ ] Fan state reflects auto/night mode
- [ ] Features can be enabled/disabled via config

## Dependencies

- Epic 3: Core Fan Control (complete)

## Technical Notes

Refer to architecture document for:
- Command encoding for `fmod`, `nmod`
- TargetFanState characteristic for auto mode

---

## Stories

### E5-S1: Implement Auto Mode

| Field | Value |
|-------|-------|
| **Story ID** | E5-S1 |
| **Points** | 2 |
| **Priority** | P1 |

#### User Story
As a user, I want to enable auto mode so that the fan adjusts based on air quality automatically.

#### Acceptance Criteria
- [ ] TargetFanState characteristic added to FanService
- [ ] AUTO (1) and MANUAL (0) states supported
- [ ] Sends `fmod: "AUTO"` command
- [ ] State syncs from device
- [ ] Works with speed control (speed ignored in auto)

#### Technical Notes
```typescript
// Fanv2 TargetFanState
// 0 = MANUAL
// 1 = AUTO

private handleTargetFanStateSet(value: CharacteristicValue): void {
  const autoMode = value === 1;
  this.device.setAutoMode(autoMode);
}
```

Dyson field: `fmod` (fan mode: OFF, FAN, AUTO)

#### Files to Create/Modify
- `src/accessories/services/fanService.ts` - Add TargetFanState
- `src/devices/pureCoolDevice.ts` - Add setAutoMode

---

### E5-S2: Implement Night Mode

| Field | Value |
|-------|-------|
| **Story ID** | E5-S2 |
| **Points** | 2 |
| **Priority** | P1 |

#### User Story
As a user, I want to enable night mode so that the fan runs quietly with dimmed display.

#### Acceptance Criteria
- [ ] Night mode exposed as separate Switch service
- [ ] Toggle sends `nmod: "ON"` / `nmod: "OFF"`
- [ ] State syncs from device
- [ ] Can be disabled via config

#### Technical Notes
```typescript
// Night mode as separate Switch service
class NightModeService {
  private handleOnSet(value: CharacteristicValue): void {
    this.device.setNightMode(value as boolean);
  }
}
```

Dyson field: `nmod` (night mode: ON, OFF)

#### Files to Create/Modify
- `src/accessories/services/nightModeService.ts` - Create
- `src/accessories/pureCoolAccessory.ts` - Add service

---

### E5-S3: Implement Continuous Monitoring

| Field | Value |
|-------|-------|
| **Story ID** | E5-S3 |
| **Points** | 1 |
| **Priority** | P2 |

#### User Story
As a user, I want continuous monitoring so that air quality is tracked even when fan is off.

#### Acceptance Criteria
- [ ] Exposed as Switch service
- [ ] Toggle sends `rhtm: "ON"` / `rhtm: "OFF"`
- [ ] State syncs from device
- [ ] Default enabled (most users want this)

#### Technical Notes
```typescript
// Continuous monitoring keeps sensors active when fan off
```

Dyson field: `rhtm` (continuous monitoring: ON, OFF)

#### Files to Create/Modify
- `src/accessories/services/continuousMonitoringService.ts` - Create
