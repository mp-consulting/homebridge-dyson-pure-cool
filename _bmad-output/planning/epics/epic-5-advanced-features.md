# Epic 5: Advanced Fan Features

| Field | Value |
|-------|-------|
| **Epic ID** | E5 |
| **Title** | Advanced Fan Features |
| **Priority** | P1 |
| **Estimated Points** | 8 |
| **Status** | Complete ✅ |
| **Completed** | E5-S1, E5-S2, E5-S3, E5-S4 (8 pts) |
| **Includes** | Auto mode, Night mode, Continuous monitoring, HP-series Heating |

---

## Description

Implement advanced fan features including auto mode, night mode, oscillation angle control, and **heating support for HP-series devices** (HP02/455, HP04/527, HP07/527E). These features enhance the user experience beyond basic fan control.

### HP02 Heating Support
The HP02 (product type 455) has heating capability. This epic includes adding HeaterCooler service support for HP-series devices.

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

---

### E5-S4: Implement Heating Support (HP-series)

| Field | Value |
|-------|-------|
| **Story ID** | E5-S4 |
| **Points** | 3 |
| **Priority** | P1 |

#### User Story
As a user with an HP-series device (HP02, HP04, HP07), I want heating control so that I can heat my room via HomeKit.

#### Acceptance Criteria
- [ ] HeaterCooler service for HP-series devices
- [ ] CurrentHeaterCoolerState characteristic (INACTIVE, IDLE, HEATING, COOLING)
- [ ] TargetHeaterCoolerState characteristic (AUTO, HEAT, COOL)
- [ ] HeatingThresholdTemperature for target temp
- [ ] Sends `hmod: "HEAT"` / `hmod: "OFF"` and `hmax` for temp
- [ ] State syncs from device
- [ ] Only enabled for HP-series product types (455, 527, 527E)

#### Technical Notes
```typescript
class HeaterCoolerService {
  constructor(accessory: PlatformAccessory, device: DysonLinkDevice);

  // Target temp: 1°C - 37°C
  // Dyson uses Kelvin * 10: (celsius + 273.15) * 10
  private handleHeatingThresholdSet(value: CharacteristicValue): void {
    const celsius = value as number;
    this.device.setTargetTemperature(celsius);
  }

  private handleTargetStateSet(value: CharacteristicValue): void {
    // 0 = AUTO, 1 = HEAT, 2 = COOL
    if (value === 1) {
      this.device.setHeatingMode(true);
    } else {
      this.device.setHeatingMode(false);
    }
  }
}
```

Dyson fields:
- `hmod`: HEAT, OFF (heating mode)
- `hmax`: 2740-3100 (target temp in Kelvin × 10)

Product types with heating:
- 455 (HP02 Pure Hot+Cool Link) - **confirmed via API capture**
- 527 (HP04 Pure Hot+Cool)
- 527E (HP07 Purifier Hot+Cool)

#### Files to Create/Modify
- `src/accessories/services/heaterCoolerService.ts` - Create
- `src/devices/dysonLinkDevice.ts` - Add heating methods
- `src/accessories/dysonLinkAccessory.ts` - Conditionally add service
