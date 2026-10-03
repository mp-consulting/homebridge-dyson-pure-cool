# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] - 2026-10-03

### Changed

- **Dependabot is enabled.** It opens pull requests for outdated npm dependencies (weekly) and GitHub Actions (monthly), and GitHub now alerts on and fixes vulnerable dependencies. The plugin itself is unchanged.

## [1.3.1] - 2026-10-03

### Changed

- **Support footer rendered by the UI kit**: the GitHub / npm links at the bottom of the config UI are now drawn by `MpKit.Footer.render` instead of hand-written markup, so every @mp-consulting plugin shows the same links, separators and icons.
- **`@mp-consulting/homebridge-ui-kit` 1.1.0**: helper output is HTML-escaped, settings cards and tab borders are visible in the light theme, the active tab keeps WCAG AA contrast in dark mode, and the footer icons are inline SVG so they no longer depend on an icon font.

## [1.3.0] - 2026-10-03

### Security

- **The settings page logged Dyson credentials** ([#18](https://github.com/mp-consulting/homebridge-dyson-pure-cool/pull/18)): the UI server logged the first 500 characters of every Dyson API response, which include the account token and the local MQTT password of each device, and those logs are often pasted into bug reports. It now logs only the status code and size. The email and password held during sign-in are also cleared after any failed attempt instead of lingering for up to 10 minutes, and the email, one-time code, country code and IP sent by the page are validated.
- **A device name could inject script into the settings page**: the wizard's HTML escaping did not escape quotes, so a name containing `"` could break out of an attribute. Quotes are now escaped.
- **Device passwords could be sent to a spoofed mDNS answer**: an IP found via mDNS is now only used if it is a local-network address, and a change of IP is logged as a warning.
- **Credential fields are masked** in the Homebridge settings form.

### Fixed

- **Commands that failed looked successful in HomeKit**: when a command could not be sent (device offline, broken connection), the Home app showed the change as applied and nothing was logged. The error now reaches HomeKit and is logged.
- **Turning a device off and quickly back on left it off** while the Home app showed it on: the ON command was skipped because the device had not yet reported that it was off.
- **The accessory never showed "No Response"**: while a device is disconnected, HomeKit now gets a communication error instead of stale values. Missing sensor readings no longer show invented values (20 °C, 50 % humidity, 100 % filter life); the last known value is kept instead.
- **Names changed in the Home app were reset on every restart**: the plugin now only names a service when it first creates it.
- **Disabled options left dead tiles in the Home app**: turning off jet focus, night mode, a sensor, the filter or a heating service now removes it from the accessory.
- **A device could stop updating after a reconnect**, or reconnect after Homebridge had asked it to disconnect. Connections from failed attempts are now closed properly.
- **When a device changed IP, HomeKit kept controlling the old connection** until restart. The same device is now reconnected at the new address, which is also remembered across restarts.
- **One invalid entry in `devices` stopped every device from loading**: entries without a serial number are now skipped with an error in the log.
- **Fan speed showed 0 % in auto mode**; it now shows the last manual speed. Moving the speed slider while the fan is off powers it on and keeps the chosen speed.
- **Air quality ignored PM10, VOC and NO2** on newer models; the rating now reflects the worst of them. On Pure Cool Link models, the 0–9 particle index is no longer shown as a PM2.5 density.
- **Filter life ignored the carbon filter** when a HEPA value was present; it now shows whichever is more worn.
- **Choosing Auto on the humidifier flipped back to Humidifier**, and the heater's target temperature could fall outside the range HomeKit accepts.

### Changed

- **Firmware version**: the accessory now shows the firmware reported by the Dyson cloud instead of `1.0.0`. Run the setup wizard again to fill it in for existing devices.
- **Fewer HomeKit updates**: values are only pushed when they change, and offline devices share one network scan when looking for a new IP.
- **Development**: test files are now type-checked (`npm run typecheck`, also run in CI), GitHub Actions are pinned to commit SHAs, and the test suite grew from 607 to 836 tests.

## [1.2.4] - 2026-09-10

### Fixed

- **`characteristic value expected valid finite number and received "NaN"` warnings from invalid filter telemetry** ([#15](https://github.com/mp-consulting/homebridge-dyson-pure-cool/pull/15)): some devices return filter life values that cannot be parsed as a number. `parseInt` produced `NaN`, which was assigned straight to `hepaFilterLife` / `carbonFilterLife` and eventually reached HomeKit's `FilterLifeLevel` characteristic, where Homebridge rejected it with a warning on every update. The values are now parsed and checked before being assigned.
- **The same unguarded parse remained for four more fields** ([#16](https://github.com/mp-consulting/homebridge-dyson-pure-cool/issues/16)): `oscs`, `osce`, `hmax` and `humt` had the identical pattern, so a device returning a non-numeric value for any of them wrote `NaN` into device state and produced the same warning. All four now follow the parse-check-assign pattern already used for `sltm` and the filter fields — invalid telemetry leaves the previous known-good value in place instead of overwriting it.

### Changed

- **Dependencies**: Updated all dependencies to latest compatible versions, including `homebridge-lib` ^8.1.5, `mqtt` ^5.15.2, `bonjour-service` ^1.4.4 and `@homebridge/plugin-ui-utils` ^2.2.6, plus dev-only major bumps for `vitest` (4→5) and `@types/node` (25→26).

## [1.2.3] - 2026-08-10

### Fixed

- **The Homebridge log showed `[DysonPureCool]` instead of `[Dyson Pure Cool]`**: Homebridge derives a plugin's log prefix from `name` in its platform config, falling back to the plugin alias when that key is absent. `config.schema.json` declared a `name` property but never listed it in `layout`, so the settings form never rendered the field and never wrote its default into `config.json`. `name` is now the first control in the form and defaults to `Dyson Pure Cool`. The setup wizard also hardcoded the name on save, overwriting a custom one; it now preserves what is already configured.
- **404s in the browser console on every visit to the settings page**: the vendored minified Bootstrap files kept their trailing `sourceMappingURL` comment, so the browser asked for `bootstrap.min.css.map` and `bootstrap.bundle.min.js.map` and got a 404 for each. The copy step now strips the comment instead of shipping ~920 kB of source maps.

## [1.2.2] - 2026-08-09

### Fixed

- **Config UI rendered unstyled and its controls did nothing**: Bootstrap and Bootstrap Icons were loaded from `cdn.jsdelivr.net`, which the Homebridge UI's content-security policy refuses. Both stylesheets and the script were blocked, so the page lost its styling and `bootstrap` was never defined, leaving tabs, modals and collapses inert. All three are now vendored into the plugin and served from it, alongside the icon font.
- **Lint walked the gitignored `tmp/` directory**: ESLint's flat config does not read `.gitignore`, so a stale local scratch directory could fail `npm run lint` even though CI passed. `tmp/**` is now in the config's own ignore list.

## [1.2.1] - 2026-08-09

### Changed

- **Node.js support is now `^22.10.0 || ^24.0.0 || ^26.0.0`**: adds Node 26, which Homebridge 2.3.0 supports as of this release, and drops Node 20. Homebridge 2.x has never accepted Node 20 (it has required `^22 || ^24` since 2.0.0), so the previous range advertised a combination that could not actually run. CI now builds on Node 22.x, 24.x and 26.x.

## [1.2.0] - 2026-08-05

### Added

- **Night Mode for the Dyson Cool (CF1, product type 739)**: The CF1 supports Sleep/Quiet Mode through the standard `nmod` field, but its catalog entry declared `nightMode: false`, so the HomeKit Night Mode switch was never created even with `enableNightMode` turned on. The command, state decoding and switch were all already in place and are not model-specific — only the catalog flag was missing. Confirmed on a CF1: `nmod: ON` activates Sleep/Quiet Mode, `nmod: OFF` disables it, and the switch follows the state reported by the fan (#10).
- **The `enable*WhenActivating` options now work**: `enableAutoModeWhenActivating`, `enableOscillationWhenActivating` and `enableNightModeWhenActivating` were offered per device in the Homebridge UI but had no implementation — setting them did nothing. Each selected mode is now switched on whenever the device goes from off to on, covering all power-on paths (the HomeKit power toggle, moving the speed slider up from zero, and turning on heating). Modes the model does not support are skipped rather than sent, so auto mode is never pushed to a plain fan, and all the commands travel in a single MQTT message alongside the power command (#11).

## [1.1.1] - 2026-07-09

### Fixed

- **CF1 (product type 739) power on/off did nothing**: The CF1 fan only honours the dedicated `fpwr` power field and silently ignores the legacy `fmod` power+mode field. Because `739` wasn't flagged as an `fpwr` device, `setFanPower` sent `fmod: FAN`/`fmod: OFF`, so HomeKit's on/off toggle had no effect and reverted to the fan's real state, while speed (`fnsp`) and oscillation (`oson`) kept working (#7). The fan power command protocol is now catalog-driven: a new `powerProtocol` field on each device model (defaulting to `fmod`) selects the field, with `739` and the Pure Cool Link models (475/469) set to `fpwr`. All other models are unchanged. Confirmed against the MyDyson app, where the `fmod` group is exactly `{455, 455C, 475, 469}` and every newer machine — including the CF1 — uses `fpwr`.

## [1.1.0] - 2026-07-06

### Added

- **Dyson Cool (CF1, product type 739)**: Fan-only support — power, speed (0–10), and oscillation on/off. No air-quality/temperature/humidity sensors and no auto toggle, matching the hardware (#7).

## [1.0.33] - 2026-07-05

### Fixed

- **2FA verification code rejected during cloud pairing**: The setup wizard sent `country` (and `culture`) as HTTP headers on the `userstatus` / `email/auth` / `email/verify` calls. The Dyson API expects these as URL query parameters, so it ignored the headers and processed every request under a default market. For accounts in other markets, the OTP challenge was created in one market and verified in another, and the emailed code came back as unverifiable — blocking 2FA setup (#6). Country and culture are now sent as query parameters on all three auth calls, matching the Dyson app. Verified end-to-end against a live 2FA account.

## [1.0.32] - 2026-06-17

### Fixed

- **Blank configuration screen**: The config UI could render completely blank for returning users whose saved config contained a device entry without a valid `serial` (e.g. a hand-edited `config.json`, a partially-added device, or a config from an older field layout). `renderDeviceCard` called `serial.replace(...)` unconditionally, throwing during the wizard's startup render and aborting before any step was shown. The serial is now guarded, malformed device entries are filtered out on load, and the initial render is wrapped so a single bad entry falls back to fresh setup instead of blanking the whole screen.

## [1.0.31] - 2026-05-18

### Fixed

- **MQTT `Connection refused: Identifier rejected`**: Some Dyson firmware (notably the Big+Quiet BP02/BP03/BP04 series) rejects the historical CONNECT shape at CONNACK, leaving the plugin unable to talk to the device. The client now tries a small ladder of CONNECT variants — short clientId, persistent session, MQTT 5, MQTT 3.1 — only escalating on CONNACK-level rejections (`Identifier rejected`, `Unacceptable protocol version`, `Bad username or password`, `Not authorized`). Transient errors (timeouts, `ECONNREFUSED`) still fail fast as before. The variant that worked is cached for subsequent reconnects, and surfaced in the connect log when a fallback was needed.

## [1.0.30] - 2026-05-18

### Added

- **Config UI**: "Sensor Calibration" controls are now available in each device's settings panel — Temperature offset (°C), Humidity offset (%), and Use Fahrenheit (logs only). These per-device settings were already supported in `config.json` but were not surfaced in the custom UI wizard, so users had to edit JSON directly to use them.

### Tests

- Added unit coverage for `temperatureOffset`, `humidityOffset`, and `useFahrenheit` in `TemperatureService` and `HumidityService` — including negative/positive offsets, humidity clamping at 0% / 100%, offset applied to the sensor-unavailable default, the Fahrenheit log format, and confirmation that HomeKit GET still returns Celsius regardless of the Fahrenheit toggle.

### Changed

- **Dependencies**: Updated all dependencies to latest compatible versions.

## [1.0.29] - 2026-04-17

### Changed

- **Dependencies**: Updated all dependencies to latest versions, including major bumps for `@homebridge/plugin-ui-utils` (1→2), `homebridge-lib` (7→8), `eslint` (9→10), `typescript` (5→6), and `@types/node` (24→25)

## [1.0.28] - 2026-04-04

### Changed

- **Node.js**: Add Node.js 24.x support to CI matrix and publish workflow

## [1.0.27] - 2026-03-30

### Changed

- **Dependencies**: Add `class-validator` as a direct dependency for `homebridge-config-ui-x` compatibility
- **Node.js**: Standardize `.tool-versions` to Node 20.22.2

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
