# Epic 4: Environmental Sensors

| Field | Value |
|-------|-------|
| **Epic ID** | E4 |
| **Title** | Environmental Sensors |
| **Priority** | P0 |
| **Estimated Points** | 6 |
| **Status** | Ready |

---

## Description

Implement temperature and humidity sensors that display environmental readings in HomeKit. These sensors provide valuable information to users about their indoor environment.

## Value Statement

Environmental sensors complement fan control by showing users the conditions in their room, enabling smarter automation decisions.

## Acceptance Criteria

- [ ] Temperature displays in HomeKit (Celsius)
- [ ] Humidity displays in HomeKit (percentage)
- [ ] Sensors update automatically (configurable interval)
- [ ] Accurate unit conversion from Dyson format
- [ ] Sensors can be disabled via config

## Dependencies

- Epic 1: Project Infrastructure (complete)
- Epic 2: Device Discovery & Connection (complete)
- Epic 3: Core Fan Control (complete)

## Technical Notes

Refer to architecture document for:
- Temperature conversion: `(kelvin × 10) / 10 - 273.15 = Celsius`
- Humidity is direct percentage
- Service handlers pattern

---

## Stories

### E4-S1: Implement Temperature Service

| Field | Value |
|-------|-------|
| **Story ID** | E4-S1 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a user, I want to see room temperature in HomeKit so that I can monitor my environment.

#### Acceptance Criteria
- [ ] `TemperatureService` class created
- [ ] Uses HomeKit TemperatureSensor service
- [ ] CurrentTemperature characteristic
- [ ] Converts from Kelvin×10 to Celsius
- [ ] Updates on device state change
- [ ] Handles invalid readings gracefully

#### Technical Notes
```typescript
class TemperatureService {
  private convertTemperature(kelvinTimes10: string): number {
    // "2950" → 21.85°C
    return (parseInt(kelvinTimes10, 10) / 10) - 273.15;
  }
}
```

Dyson field: `tact` (temperature actual)

#### Files to Create/Modify
- `src/accessories/services/temperatureService.ts` - Create
- `src/utils/conversions.ts` - Temperature conversion

---

### E4-S2: Implement Humidity Service

| Field | Value |
|-------|-------|
| **Story ID** | E4-S2 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a user, I want to see humidity level in HomeKit so that I can monitor comfort.

#### Acceptance Criteria
- [ ] `HumidityService` class created
- [ ] Uses HomeKit HumiditySensor service
- [ ] CurrentRelativeHumidity characteristic
- [ ] Direct percentage (no conversion needed)
- [ ] Updates on device state change
- [ ] Handles invalid readings gracefully

#### Technical Notes
```typescript
class HumidityService {
  private handleHumidityGet(): CharacteristicValue {
    return this.device.state.humidity; // Direct %
  }
}
```

Dyson field: `hact` (humidity actual)

#### Files to Create/Modify
- `src/accessories/services/humidityService.ts` - Create

---

### E4-S3: Add Sensors to Accessory

| Field | Value |
|-------|-------|
| **Story ID** | E4-S3 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a user, I want temperature and humidity sensors included with my fan accessory so that everything is in one place.

#### Acceptance Criteria
- [ ] `PureCoolAccessory` creates temperature service
- [ ] `PureCoolAccessory` creates humidity service
- [ ] Services linked to accessory
- [ ] Services update on state change
- [ ] Can be disabled via config options

#### Technical Notes
```typescript
class PureCoolAccessory {
  protected setupServices(): void {
    this.fanService = new FanService(...);

    if (this.config.enableTemperature !== false) {
      this.temperatureService = new TemperatureService(...);
    }
    if (this.config.enableHumidity !== false) {
      this.humidityService = new HumidityService(...);
    }
  }
}
```

#### Files to Create/Modify
- `src/accessories/pureCoolAccessory.ts` - Update

---

### E4-S4: Implement Sensor State Parsing

| Field | Value |
|-------|-------|
| **Story ID** | E4-S4 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a developer, I want sensor data parsed from device messages so that values are available to services.

#### Acceptance Criteria
- [ ] `MessageCodec` parses `tact` (temperature)
- [ ] `MessageCodec` parses `hact` (humidity)
- [ ] Handles `ENVIRONMENTAL-CURRENT-SENSOR-DATA` messages
- [ ] Invalid values handled (e.g., "OFF", "INIT")
- [ ] Unit tests for parsing

#### Technical Notes
```typescript
// Some devices report "OFF" when sensor unavailable
if (data.tact === 'OFF' || data.tact === 'INIT') {
  return null; // Sensor not ready
}
```

#### Files to Create/Modify
- `src/protocol/messageCodec.ts` - Update
- `test/unit/protocol/messageCodec.test.ts` - Add sensor tests
