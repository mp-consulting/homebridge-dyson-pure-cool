# Accessories

HomeKit accessory implementations that bridge Dyson devices to Apple HomeKit.

## Structure

```
accessories/
├── index.ts              # Module exports
├── dysonAccessory.ts     # Abstract base class for all Dyson accessories
├── dysonLinkAccessory.ts # Main accessory implementation
└── services/             # Individual HomeKit service handlers
```

## Files

### dysonAccessory.ts
Abstract base class providing common functionality:
- Sets up AccessoryInformation service (manufacturer, model, serial, firmware)
- Manages device reference and state change subscriptions
- Maps Dyson product types to human-readable model names
- Defines abstract `setupServices()` method for subclasses

### dysonLinkAccessory.ts
Main HomeKit accessory implementation for all Dyson models:
- Pure Cool, Hot+Cool, Humidify+Cool, Big+Quiet series
- Configures services based on device capabilities and user settings
- Handles sensor calibration, display options, and activation behaviors

## Services

Each service file implements a specific HomeKit service:

| Service | File | HomeKit Type | Purpose |
|---------|------|--------------|---------|
| Fan | `fanService.ts` | AirPurifier | Fan/purifier control, speed, oscillation |
| Temperature | `temperatureService.ts` | TemperatureSensor | Temperature monitoring |
| Humidity | `humidityService.ts` | HumiditySensor | Humidity monitoring |
| Air Quality | `airQualityService.ts` | AirQuality | PM2.5, PM10, VOC, NO2 levels |
| Night Mode | `nightModeService.ts` | Switch | Silent operation mode |
| Continuous Monitoring | `continuousMonitoringService.ts` | Switch | Keep sensors active when off |
| Filter | `filterService.ts` | Filter | HEPA/Carbon filter life |
| Thermostat | `thermostatService.ts` | Thermostat | Heating control (legacy) |
| Heater Cooler | `heaterCoolerService.ts` | HeaterCooler | Heating control (modern) |
| Humidifier | `humidifierControlService.ts` | Humidifier | Humidity control, water tank status |
| Jet Focus | `jetFocusService.ts` | Switch | Front airflow direction |

## Design Pattern

Uses the Adapter pattern to translate between:
- **HomeKit characteristics**: Percentages, Celsius temperatures, boolean states
- **Dyson device state**: Raw sensor values, protocol-specific formats
