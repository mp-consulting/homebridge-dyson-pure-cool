# Epic 7: Filter & Maintenance

| Field | Value |
|-------|-------|
| **Epic ID** | E7 |
| **Title** | Filter & Maintenance |
| **Priority** | P2 |
| **Estimated Points** | 3 |
| **Status** | Ready |

---

## Description

Implement filter life monitoring that shows filter status in HomeKit. This helps users know when to replace filters.

## Value Statement

Filter maintenance reminders prevent air quality degradation and help users maintain their devices properly.

## Acceptance Criteria

- [ ] Filter life percentage displays
- [ ] Filter change indicator triggers when low
- [ ] Both HEPA and carbon filter tracked (if applicable)
- [ ] Can be disabled via config

## Dependencies

- Epic 4: Environmental Sensors (complete)

## Technical Notes

Refer to architecture document for:
- FilterMaintenance service
- Filter life fields (`filf`, `fltf`, `cflr`)

---

## Stories

### E7-S1: Implement Filter Service

| Field | Value |
|-------|-------|
| **Story ID** | E7-S1 |
| **Points** | 2 |
| **Priority** | P2 |

#### User Story
As a user, I want to see filter life remaining so that I know when to replace it.

#### Acceptance Criteria
- [ ] `FilterService` class created
- [ ] Uses HomeKit FilterMaintenance service
- [ ] FilterLifeLevel characteristic (0-100%)
- [ ] FilterChangeIndication characteristic
- [ ] Updates on device state change
- [ ] Change indicated at 10% or below

#### Technical Notes
```typescript
class FilterService {
  private handleFilterLifeGet(): CharacteristicValue {
    // Use HEPA filter life as primary
    return this.device.state.filterLifePercent;
  }

  private handleFilterChangeIndicationGet(): CharacteristicValue {
    // 0 = no change needed, 1 = change needed
    return this.device.state.filterLifePercent <= 10 ? 1 : 0;
  }
}
```

Dyson fields:
- `fltf` - HEPA filter life %
- `cflr` - Carbon filter life %
- `filf` - Filter life hours remaining

#### Files to Create/Modify
- `src/accessories/services/filterService.ts` - Create

---

### E7-S2: Parse Filter State

| Field | Value |
|-------|-------|
| **Story ID** | E7-S2 |
| **Points** | 1 |
| **Priority** | P2 |

#### User Story
As a developer, I want filter data parsed from device messages so that filter service has accurate data.

#### Acceptance Criteria
- [ ] `MessageCodec` parses `fltf` (HEPA %)
- [ ] `MessageCodec` parses `cflr` (carbon %)
- [ ] `MessageCodec` parses `filf` (hours)
- [ ] Handles missing fields (older devices)
- [ ] Unit tests for parsing

#### Technical Notes
```typescript
interface FilterState {
  hepaLifePercent: number;    // fltf
  carbonLifePercent: number;  // cflr
  filterLifeHours: number;    // filf
}
```

#### Files to Create/Modify
- `src/protocol/messageCodec.ts` - Update
- `test/unit/protocol/messageCodec.test.ts` - Add filter tests
