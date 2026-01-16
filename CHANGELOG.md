# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-01-16

### Fixed

- Fix PM2.5 and PM10 sensor data retrieval using correct Dyson MQTT field names (`p25r`, `p10r`)
- Fix HeaterCooler service to allow turning heating off (added AUTO mode to validValues)
- Handle INIT/OFF values in air quality sensor data parsing

## [1.0.1] - 2026-01-15

### Fixed

- Fix plugin registration with Homebridge causing "no loaded plugin could be found" warning
- Pass `PLUGIN_NAME` as first argument to `registerPlatform()` for proper accessory association

## [1.0.0] - 2026-01-15

### Changed

- Package renamed to `@mp-consulting/homebridge-dyson-pure-cool` for npm publishing

### Added

- **Complete Homebridge Plugin** - Full-featured plugin for Dyson Pure Cool devices
- **Dyson Cloud Authentication** - Automatic device discovery via Dyson account
  - Secure two-factor authentication (2FA) via email
  - OTP verification code entry
  - Automatic credential extraction for local MQTT connection
- **Custom Configuration UI** - Wizard-based setup in Homebridge Config UI X
  - Step-by-step device configuration
  - Visual progress indicator with animations
  - Device selection with checkboxes
  - Feature toggle options
  - Country selector grouped by region (Americas, Asia Pacific, Europe, Middle East)
- **Local MQTT Communication** - Direct device control without cloud dependency
  - mDNS device discovery on local network
  - IP address caching for faster reconnection
  - Auto-rediscovery when cached IP fails
  - Encrypted local credentials for authentication
  - Real-time state updates via MQTT subscriptions
- **Air Purifier Service** - Proper HomeKit integration using AirPurifier service type
  - Power on/off control
  - Fan speed adjustment (1-10 mapped to 10-100%)
  - Auto mode toggle
  - Oscillation control
- **Sensor Services**
  - Temperature sensor with calibration offset
  - Humidity sensor with calibration offset
  - Air Quality sensor (PM2.5, PM10, VOC, NO2)
- **Additional Controls**
  - Night mode switch
  - Continuous monitoring switch with MQTT control
  - Jet focus switch (where supported)
  - Filter status with replacement indicator
- **Thermostat Service** - For Hot+Cool models (HP series)
  - Heating mode control
  - Target temperature setting (10-38°C)
  - Configurable service type (HeaterCooler or Thermostat)
- **Humidifier Service** - For Humidify+Cool models (PH series)
  - Humidity target control
  - Water level status
- **Periodic Polling** - Configurable state refresh interval
- **Device Catalog** - Centralized device definitions for all supported models

### Supported Devices

- Pure Cool Link: TP02, DP01
- Pure Cool: TP04, TP06, TP07, DP04
- Pure Cool Formaldehyde: TP09
- Pure Hot+Cool Link: HP02
- Pure Hot+Cool: HP04, HP06, HP07
- Pure Hot+Cool Formaldehyde: HP09
- Purifier Humidify+Cool: PH01, PH02, PH03
- Purifier Humidify+Cool Formaldehyde: PH04
- Purifier Big+Quiet: BP02, BP03, BP04, BP06

### Technical

- TypeScript with ES modules
- Node.js 20.18+, 22.10+, or 24.0+
- Homebridge 1.8+ or 2.0 beta
- Jest test framework
- ESLint with TypeScript support
