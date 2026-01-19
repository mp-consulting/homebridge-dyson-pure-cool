# Config

Centralized configuration, constants, and device metadata.

## Structure

```
config/
├── index.ts          # Module exports
├── constants.ts      # Platform constants
└── deviceCatalog.ts  # Device model registry
```

## Files

### constants.ts
Platform-wide constants:
- `PLATFORM_NAME`: Platform identifier for Homebridge
- `PLUGIN_NAME`: Package name
- `DYSON_MQTT_PORT`: Local MQTT port (1883)
- `DYSON_MDNS_SERVICE`: mDNS service type (`_dyson_mqtt._tcp`)
- `DYSON_PRODUCT_TYPES`: Product code to model name mapping

### deviceCatalog.ts
Single source of truth for all supported Dyson devices.

**Device Series:**
- `pure-cool-link`: TP02, DP01 (older Link models)
- `pure-cool`: TP04, TP07, TP09, TP11, DP04
- `hot-cool-link`: HP02 (older heating models)
- `hot-cool`: HP04, HP06, HP07, HP09, HP11
- `humidify-cool`: PH01, PH02, PH03, PH04
- `big-quiet`: BP02, BP03, BP04, BP06

**Feature Flags:**
- Fan, oscillation, auto mode, night mode
- Temperature/humidity sensors
- Air quality sensors (PM2.5, PM10, VOC, NO2)
- Heating, humidification
- HEPA/carbon filters

**Utility Functions:**
- `getDeviceByProductType()`: Lookup device by product code
- `isProductTypeSupported()`: Check device support
- `getDeviceFeatures()`: Get feature set for a device
- `getHeatingDevices()`, `getHumidifierDevices()`: Filter by capability
