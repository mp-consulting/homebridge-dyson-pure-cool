# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-14

### Added

- **Fan Control**: Power on/off, speed (1-10), oscillation, auto mode via HomeKit Fanv2 service
- **Temperature Sensor**: Room temperature display via TemperatureSensor service
- **Humidity Sensor**: Relative humidity display via HumiditySensor service
- **Air Quality Sensor**: PM2.5, PM10, VOC levels with overall air quality rating (Excellent to Poor)
- **Filter Status**: Filter life percentage and replacement indicator via FilterMaintenance service
- **Night Mode**: Toggle switch for quiet operation with dimmed display
- **Continuous Monitoring**: Toggle switch to keep sensors active when fan is off
- **Dyson Cloud API**: Automatic device discovery and credential retrieval
- **mDNS Discovery**: Local network device discovery
- **MQTT Communication**: Real-time device control and state updates
- **Automatic Reconnection**: Exponential backoff reconnection with configurable attempts
- **Configuration UI**: Full support for Homebridge Config UI X

### Supported Devices

- Dyson Pure Cool Tower (TP04) - Product type 438
- Dyson Purifier Cool (TP07) - Product type 438E
- Dyson Pure Hot+Cool Link (HP02) - Product type 455

### Technical Details

- TypeScript ES2022 with ESM modules
- Comprehensive test suite (400+ unit tests)
- HomeKit services: Fanv2, TemperatureSensor, HumiditySensor, AirQualitySensor, FilterMaintenance, Switch
- Protocol support for Dyson MQTT STATE-SET, CURRENT-STATE, STATE-CHANGE, ENVIRONMENTAL-CURRENT-SENSOR-DATA messages
