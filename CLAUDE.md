# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homebridge plugin for Dyson Pure Cool air purifiers and fans. It provides HomeKit integration for Dyson devices including Pure Cool, Hot+Cool, Humidify+Cool, and Big+Quiet series.

## Architecture

### Directory Structure

- `src/` - Main TypeScript source code
  - `accessories/` - HomeKit accessory handlers
    - `services/` - Individual HomeKit service implementations (FanService, TemperatureService, etc.)
  - `api/` - Dyson Cloud API client (authentication, device discovery)
  - `config/` - Device catalog and configuration constants
  - `devices/` - Device abstraction layer (DysonLinkDevice, DeviceManager)
  - `discovery/` - mDNS device discovery
  - `protocol/` - MQTT message encoding/decoding
- `homebridge-ui/` - Custom Homebridge Config UI wizard
  - `public/` - Frontend HTML/JS/CSS
  - `server.ts` - Backend API for the UI
- `test/` - Jest test suites
- `scripts/` - Development and testing scripts

### Key Components

1. **DysonLinkDevice** (`src/devices/dysonLinkDevice.ts`) - Core device class handling MQTT communication
2. **MessageCodec** (`src/protocol/messageCodec.ts`) - Encodes/decodes Dyson MQTT protocol messages
3. **Device Catalog** (`src/config/deviceCatalog.ts`) - Registry of all supported device models and their features
4. **Services** (`src/accessories/services/`) - Individual HomeKit service implementations

### Device Protocol

Dyson devices use MQTT for local communication:
- **Older Link models** (HP02, TP02, DP01): Use `auto`/`fpwr` fields for mode control
- **Newer models** (HP04+, TP04+): Use `fmod` field for mode control
- State fields: `ffoc` (jet focus), `nmod` (night mode), `rhtm` (continuous monitoring), `fnsp` (fan speed), etc.

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run specific test file
npm test -- test/unit/devices/dysonLinkDevice.test.ts

# Test device connection directly
npx tsx scripts/test-connection.ts

# Lint code
npm run lint

# Type check
npm run typecheck
```

## Testing

- Tests use Jest with ES modules (`--experimental-vm-modules`)
- Test config is in `test/hbConfig/config.json` (not committed, contains credentials)
- Mock files are in `test/unit/` directories alongside test files

## Configuration

The plugin supports two configuration methods:
1. **Dyson Cloud** - Authenticate via Homebridge UI wizard (recommended)
2. **Manual** - Provide device credentials directly in config.json

Key config options:
- `enableJetFocus` / `isJetFocusEnabled` - Show jet focus switch
- `enableNightMode` / `isNightModeEnabled` - Show night mode switch
- `isContinuousMonitoringEnabled` - Show continuous monitoring switch
- Global options apply to all devices; per-device options override globals

## Common Tasks

### Adding a New Device Model

1. Add entry to `src/config/deviceCatalog.ts` with product type and features
2. Update README.md supported devices table
3. Run tests to verify

### Adding a New HomeKit Service

1. Create service class in `src/accessories/services/`
2. Add to `DysonLinkAccessory.setupServices()`
3. Add config option to `config.schema.json` and `homebridge-ui/`
4. Add tests

### Debugging Device Communication

Use `scripts/test-connection.ts` to see raw MQTT messages from the device.
