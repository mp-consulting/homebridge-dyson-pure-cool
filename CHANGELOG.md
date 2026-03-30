# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.26] - 2026-03-30

### Changed

- **Dependencies**: Updated all dependencies to latest versions including `@homebridge/plugin-ui-utils` ^2.2.3, `homebridge-lib` ^7.3.2, `mqtt` ^5.15.1, `eslint` ^10.1.0, `typescript` ^6.0.2, `vitest` ^4.1.2, and other dev dependencies.

## [1.0.25] - 2026-03-26

### Changed

- **Dependencies**: Updated all dependencies to latest compatible versions

## [1.0.24] - 2026-03-06

### Fixed

- **Offline device crash**: Removed all listeners before adding a no-op error handler before calling `end(true)` on the MQTT client, so orphaned internal timers (connack timeout, keepalive) can no longer fire unhandled `error` events that crash the Homebridge process

### Changed

- **Offline retry**: When a device is unreachable at startup or after MQTT reconnection is exhausted, the plugin now schedules an automatic retry every 5 minutes so the device reconnects as soon as it comes back online — no Homebridge restart needed

## [1.0.23] - 2026-03-06

### Changed

- **Config UI**: Heating Service option in device settings now shows a scannable list explaining each choice (Thermostat, Heater Cooler, Both)

## [1.0.22] - 2026-03-06

### Changed

- **Config UI**: Save button renamed from "Save Configuration" to "Save" and right-aligned
- **Config UI**: Cancel button added to the re-sync login form to return to the device list without re-authenticating

## [1.0.21] - 2026-03-06

### Changed

- **Config UI**: "Edit Options" and "Re-sync" buttons moved inline with the "Your Dyson Devices" title as small icon-only buttons (`bi-sliders` and `bi-arrow-repeat`)

## [1.0.20] - 2026-03-06

### Changed

- **Config UI**: Device cards are now compact — continuous monitoring and heating service settings moved into a collapsible panel opened with the gear button, reducing screen estate for multi-device setups
- **Config UI**: Move `kit.css`/`kit.js` to `homebridge-ui/public/lib/` subdirectory

## [1.0.19] - 2026-03-05

### Changed

- **Config UI**: Inline error messages in login and OTP steps — errors persist in the card instead of disappearing with toasts
- **Config UI**: Password visibility toggle on the password field
- **Config UI**: Country auto-detected from browser locale (`navigator.language`) on first setup
- **Config UI**: Re-sync button shows a hint banner and focuses the email field
- **Config UI**: Jet Focus option in step 3 is hidden when no selected device supports it (derived from device catalog)
- **Config UI**: Device cards show firmware version badge and "Update available" warning when `newVersionAvailable` is set
- **Config UI**: Remove button on each device card in the existing config view (step 0)
- **Config UI**: Country select is now full-width (removed `max-width: 200px`)
- **Config UI**: Device card layout uses natural flex flow instead of absolutely-positioned checkbox
- **Config UI**: `jetFocusProductTypes` added to `/get-product-types` response so jet focus capability is correctly derived for existing config devices

## [1.0.18] - 2026-03-05

### Fixed

- **Config UI**: Fix "Unable to authenticate user" error — add provisioning step (`GET /v1/provisioningservice/application/Android/version`) before authentication to unlock the client IP on Dyson's server
- **Config UI**: Simplified request headers to `User-Agent: android client` — remove stale `X-App-Version`, `X-Platform`, and `Accept-Language` headers that were causing auth rejection

## [1.0.17] - 2026-03-05

### Changed

- **Config UI**: Migrated to `@mp-consulting/homebridge-ui-kit` design system (Bootstrap 5.3, Bootstrap Icons)
- **Config UI**: Converted setup wizard to full HTML document with proper `<head>`/`<body>` structure
- **Config UI**: Added dark/light mode theme detection from system preference and Homebridge user settings via `data-bs-theme` attribute
- **Config UI**: Replaced `.dark-mode` CSS class approach with Bootstrap-compatible `[data-bs-theme="dark"]` selectors
- **Config UI**: Replaced hardcoded colors with Bootstrap CSS variables for automatic dark/light mode adaptation
- **Config UI**: Replaced emoji icons with Bootstrap Icons (`bi-wind`, `bi-envelope-fill`, `bi-check-lg`, `bi-github`, `bi-npm`)
- **Config UI**: Added footer with GitHub and npm links
- **package.json**: Added `copy:ui-kit` script, added `@mp-consulting/homebridge-ui-kit` devDependency

## [1.0.16] - 2026-03-04

### Fixed

- **MQTT keepalive crash**: Call `client.end()` before removing listeners during reconnection and cleanup, preventing orphaned keepalive timers from firing unhandled errors that crash the entire Homebridge process

## [1.0.15] - 2026-02-22

### Added

- Support for PH05 (Dyson Purifier Humidify+Cool De-Nox) - product type `358K`
- Fix HP06 (Cryptomic) incorrectly mapped to product type `358K` - HP06 shares product type `527` with HP04

## [1.0.14] - 2026-02-21

### Fixed

- Fix device not turning off - command batching could overwrite the OFF command with a concurrent mode change (e.g. AUTO), preventing the device from turning off
- Restore TP06 (Pure Cool Cryptomic) to supported devices - was incorrectly removed during earlier refactoring (shares product type `438` with TP04)
- Fix stale accessory handler leak when device IP is rediscovered - old handler is now destroyed before recreating
- Fix linked service direction in HomeKit - secondary services (sensors, switches) are now correctly linked to the primary Air Purifier service
- Fix duplicate connect event emission causing double state sync on reconnection
- Fix double resolve in mDNS discovery when timeout and early stop fire simultaneously
- Fix unhandled promise rejection when `commandError` event has no listeners
- Fix NightModeService returning `undefined` when device state is not yet set
- Fix infinite MQTT retry recursion in UI server when `_retried` flag was set but never checked
- Fix stale cached accessories not removed from internal map after unregistration
- Fix `pollingInterval` config option not being applied to device polling
- Fix global `enableFilterStatus` and `enableHumidifier` config options not propagated to devices
- Fix silent credential decryption failures - now logs a warning instead of silently returning empty string
- Fix raw device state leaked to frontend in UI server device state response
- Fix README config option names (`pollInterval` -> `pollingInterval`, `enableFilter` -> `enableFilterStatus`)

### Added

- Support for TP11 (Purifier Cool) and HP11 (Purifier Hot+Cool) models in supported devices table
- Support for both v2 and v3 Dyson Cloud API field name formats in UI server for forward compatibility
- Pending auth timeout (10 minutes) in UI server to clear stored credentials from memory
- `HEATING_TOLERANCE_CELSIUS` constant replacing magic number in HeaterCooler temperature comparison

### Changed

- Model name in HomeKit AccessoryInformation now uses the device catalog (e.g., "Dyson Pure Cool Tower (TP04)") instead of a hardcoded map
- Timer handles (sleep, rate limit, mDNS) now use `.unref()` for clean Node.js shutdown
- Removed unused `EveHomeKitTypes` import and related properties from platform
- Removed unused device options from `DeviceOptions` interface (`enableAutoModeWhenActivating`, `enableOscillationWhenActivating`, `enableNightModeWhenActivating`, etc.)
- Added PH03 product type `358J` to config schema (was missing alongside existing `358H`)

## [1.0.13] - 2026-01-19

### Fixed

- Fix HP02 (Pure Hot+Cool Link) fan power commands - HP02 uses `fmod` protocol like newer devices, not `fpwr`/`auto`
- Correct Link series detection: only TP02 (475) and DP01 (469) use the older `fpwr`/`auto` protocol

### Added

- New `scripts/test-commands.ts` interactive script to test device commands directly

## [1.0.12] - 2026-01-19

### Added

- Jet Focus switch (diffuse/focused airflow) now configurable via Homebridge UI
- Per-device toggle options for Night Mode, Jet Focus, and Continuous Monitoring switches
- Global config options now properly apply to all devices (with per-device override support)

### Fixed

- Fix HP02 (Hot+Cool Link) to enable Jet Focus support - device has this feature via `ffoc` protocol
- Fix tests to match updated protocol implementation (newer models use `fmod` only, no `auto` field)
- Fix error handling test for setFanPower with internal delay

## [1.0.11] - 2026-01-19

_Skipped - version bump only_

## [1.0.10] - 2026-01-19

### Improved

- Connection error messages now include troubleshooting guidance (power cycle, network check, IP verification)

## [1.0.9] - 2026-01-19

### Fixed

- Fix auto mode commands for Link series devices (HP02, TP02, DP01) - use `auto`/`fnsp` protocol instead of `fmod`
- Fix race condition when HomeKit sends Active and TargetAirPurifierState together - now delays power-on to let mode changes arrive first
- Add debug logging for MQTT commands sent and device state responses

### Added

- README documentation for each source directory (`src/`, `src/accessories/`, `src/config/`, etc.)

## [1.0.8] - 2026-01-17

### Fixed

- Improved dark mode detection - run on DOMContentLoaded, apply to both html and body elements
- Simplified CSS selectors to use `.dark-mode` instead of `body.dark-mode`

## [1.0.7] - 2026-01-17

### Fixed

- Fix dark mode detection - detect parent window's `dark-mode` class via JavaScript since iframe doesn't inherit it
- Add fallback to `prefers-color-scheme` media query when parent window access is blocked

## [1.0.6] - 2026-01-17

### Fixed

- Fix dark mode UI contrast in Homebridge Config UI X - text was unreadable (dark on dark)
- Replace Bootstrap CSS variables with explicit colors for consistent cross-theme support

## [1.0.5] - 2026-01-16

### Fixed

- Initial dark mode fix attempt (incomplete - Bootstrap variables don't work in iframe context)

## [1.0.4] - 2026-01-16

### Added

- Each service now displays its own name in HomeKit instead of the accessory name (e.g., "Temperature", "Humidity", "Air Quality" instead of all showing "Dyson Bureau")
- Fan speed slider now uses debouncing to prevent flooding the device with requests when dragging

### Changed

- Services are now linked to the primary Air Purifier service for better HomeKit organization
- Service names are set using HomeKit's ConfiguredName characteristic for proper display

## [1.0.3] - 2026-01-16

### Fixed

- Fix fan speed gauge showing 100% when in auto mode - now displays actual speed or 0% when speed is unknown

## [1.0.2] - 2026-01-16

### Fixed

- Fix PM2.5 and PM10 sensor data retrieval using correct Dyson MQTT field names (`p25r`, `p10r`)
- Fix HeaterCooler service to use proper HomeKit semantics (HEAT only mode, on/off via Active characteristic)
- Fix auto mode toggle reverting to manual - prevent `setFanPower` from overriding mode when device already on
- Fix auto mode commands sending both `auto` and `fmod` fields for compatibility with all Dyson models
- Handle INIT/OFF values in air quality sensor data parsing

### Changed

- HeaterCooler now shows only "Heat" mode since Dyson HP devices don't have active cooling
- Improved README documentation for Air Purifier auto mode and heater controls

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
