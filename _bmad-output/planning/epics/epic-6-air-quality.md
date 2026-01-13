# Epic 6: Air Quality Monitoring

| Field | Value |
|-------|-------|
| **Epic ID** | E6 |
| **Title** | Air Quality Monitoring |
| **Priority** | P1 |
| **Estimated Points** | 5 |
| **Status** | Ready |

---

## Description

Implement air quality sensors that display PM2.5, PM10, VOC, and overall air quality index in HomeKit. This provides users with detailed environmental data.

## Value Statement

Air quality monitoring is a key feature of Dyson Pure Cool devices. Exposing this data in HomeKit enables powerful automations and awareness.

## Acceptance Criteria

- [ ] Overall air quality level displays (Excellent to Poor)
- [ ] PM2.5 density displays in µg/m³
- [ ] PM10 density displays in µg/m³
- [ ] VOC index displays
- [ ] Sensors update automatically
- [ ] Can be disabled via config

## Dependencies

- Epic 4: Environmental Sensors (complete)

## Technical Notes

Refer to architecture document for:
- AirQualitySensor service
- AQI calculation from PM2.5
- VOC is index, not µg/m³

---

## Stories

### E6-S1: Implement Air Quality Service

| Field | Value |
|-------|-------|
| **Story ID** | E6-S1 |
| **Points** | 2 |
| **Priority** | P1 |

#### User Story
As a user, I want to see overall air quality in HomeKit so that I know when to purify.

#### Acceptance Criteria
- [ ] `AirQualityService` class created
- [ ] Uses HomeKit AirQualitySensor service
- [ ] AirQuality characteristic (1-5 scale)
- [ ] Calculates level from PM2.5
- [ ] Updates on device state change

#### Technical Notes
```typescript
// HomeKit AirQuality levels
enum AirQuality {
  UNKNOWN = 0,
  EXCELLENT = 1,  // PM2.5: 0-12
  GOOD = 2,       // PM2.5: 13-35
  FAIR = 3,       // PM2.5: 36-55
  INFERIOR = 4,   // PM2.5: 56-150
  POOR = 5,       // PM2.5: 151+
}
```

#### Files to Create/Modify
- `src/accessories/services/airQualityService.ts` - Create
- `src/utils/conversions.ts` - AQI calculation

---

### E6-S2: Add PM2.5 Density

| Field | Value |
|-------|-------|
| **Story ID** | E6-S2 |
| **Points** | 1 |
| **Priority** | P1 |

#### User Story
As a user, I want to see PM2.5 levels so that I can monitor fine particulates.

#### Acceptance Criteria
- [ ] PM2_5Density characteristic added
- [ ] Value in µg/m³
- [ ] Direct from Dyson `pm25` field
- [ ] Updates on state change

#### Technical Notes
```typescript
// PM2.5 is direct value, no conversion
this.service.updateCharacteristic(
  Characteristic.PM2_5Density,
  state.pm25,
);
```

Dyson field: `pm25`

#### Files to Create/Modify
- `src/accessories/services/airQualityService.ts` - Add characteristic

---

### E6-S3: Add PM10 Density

| Field | Value |
|-------|-------|
| **Story ID** | E6-S3 |
| **Points** | 1 |
| **Priority** | P2 |

#### User Story
As a user, I want to see PM10 levels so that I can monitor larger particles.

#### Acceptance Criteria
- [ ] PM10Density characteristic added
- [ ] Value in µg/m³
- [ ] Direct from Dyson `pm10` field
- [ ] Updates on state change

#### Technical Notes
Dyson field: `pm10`

#### Files to Create/Modify
- `src/accessories/services/airQualityService.ts` - Add characteristic

---

### E6-S4: Add VOC Index

| Field | Value |
|-------|-------|
| **Story ID** | E6-S4 |
| **Points** | 1 |
| **Priority** | P2 |

#### User Story
As a user, I want to see VOC index so that I can monitor air purity.

#### Acceptance Criteria
- [ ] VOCDensity characteristic added
- [ ] Value is index (not µg/m³)
- [ ] Direct from Dyson `vact` field
- [ ] Updates on state change

#### Technical Notes
```typescript
// Note: VOC is an index value, not actual density
// HomeKit expects µg/m³ but Dyson provides index
// This is a known limitation - display as-is
```

Dyson field: `vact`

#### Files to Create/Modify
- `src/accessories/services/airQualityService.ts` - Add characteristic
