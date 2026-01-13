# Workflow: Design HomeKit Mapping

**Agent:** Architect
**Shortcut:** `*design-homekit-mapping` or `HM`
**Phase:** 3 - Solutioning

## Purpose

Design how Dyson device capabilities map to HomeKit services and characteristics for optimal Apple Home experience.

## HomeKit Service Mapping

### Primary Accessory: Fan v2

```typescript
Service.Fanv2
├── Characteristic.Active (on/off)
├── Characteristic.RotationSpeed (0-100%)
├── Characteristic.SwingMode (oscillation)
├── Characteristic.TargetFanState (manual/auto)
└── Characteristic.CurrentFanState
```

### Air Quality Sensor

```typescript
Service.AirQualitySensor
├── Characteristic.AirQuality (0-5 scale)
├── Characteristic.PM2_5Density (µg/m³)
├── Characteristic.PM10Density (µg/m³)
├── Characteristic.VOCDensity (µg/m³)
└── Characteristic.NitrogenDioxideDensity
```

### Temperature Sensor

```typescript
Service.TemperatureSensor
└── Characteristic.CurrentTemperature (Celsius)
```

### Humidity Sensor

```typescript
Service.HumiditySensor
└── Characteristic.CurrentRelativeHumidity (%)
```

### Filter Maintenance (Custom)

```typescript
Service.FilterMaintenance
├── Characteristic.FilterChangeIndication
└── Characteristic.FilterLifeLevel (%)
```

## Value Mapping

### Fan Speed: Dyson → HomeKit

| Dyson Value | HomeKit Percentage |
|-------------|-------------------|
| "0001" | 10% |
| "0002" | 20% |
| ... | ... |
| "0010" | 100% |
| "AUTO" | Auto mode |

### Air Quality: Dyson → HomeKit

| Dyson PM2.5 | HomeKit AirQuality |
|-------------|-------------------|
| 0-12 | EXCELLENT (1) |
| 13-35 | GOOD (2) |
| 36-55 | FAIR (3) |
| 56-150 | INFERIOR (4) |
| 151+ | POOR (5) |

### Temperature Conversion
- Dyson reports in Kelvin × 10 (e.g., 2950 = 295K = 21.85°C)
- HomeKit expects Celsius
- Formula: `(value / 10) - 273.15`

## Accessory Structure

```
Dyson Pure Cool TP04
├── Fan v2 (primary)
│   ├── On/Off
│   ├── Speed (1-10)
│   ├── Oscillation
│   └── Auto Mode
├── Air Quality Sensor
│   ├── Overall Air Quality
│   ├── PM2.5
│   ├── PM10
│   └── VOCs
├── Temperature Sensor
│   └── Current Temperature
├── Humidity Sensor
│   └── Current Humidity
└── Filter Maintenance
    ├── Change Required
    └── Life Remaining
```

## Outputs
- HomeKit mapping specification
- Value conversion formulas
- Accessory structure diagram

## Next Steps
Return to PM for `*create-epics` with complete technical context.
