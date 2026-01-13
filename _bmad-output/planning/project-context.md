# Project Context: homebridge-dyson-pure-cool

## Overview

This project aims to create a Homebridge plugin that enables Apple HomeKit control of Dyson Pure Cool air purifiers and fans.

## Project Type

- **Category:** Homebridge Dynamic Platform Plugin
- **Language:** TypeScript
- **Runtime:** Node.js (v20+)
- **Target Platform:** Apple HomeKit via Homebridge

## Goals

1. **Primary Goal:** Allow users to control their Dyson Pure Cool devices through Apple Home app
2. **Secondary Goals:**
   - Expose air quality sensor data to HomeKit
   - Support multiple Dyson device models
   - Provide reliable, local-first communication

## Target Devices

### Dyson Pure Cool Series
- TP04 - Pure Cool Tower
- TP07 - Purifier Cool
- TP09 - Purifier Cool Formaldehyde

### Dyson Pure Hot+Cool Series
- HP04 - Pure Hot+Cool
- HP07 - Purifier Hot+Cool
- HP09 - Purifier Hot+Cool Formaldehyde

### Dyson Pure Humidify+Cool Series
- PH01 - Pure Humidify+Cool
- PH03 - Purifier Humidify+Cool
- PH04 - Purifier Humidify+Cool Formaldehyde

## Technical Context

### Current Codebase
- Based on official Homebridge plugin template
- TypeScript with ES2022 target
- ESLint and strict TypeScript configuration
- CI/CD via GitHub Actions

### Key Dependencies
- `homebridge` v2.0.0-beta or v1.8.0+
- `homebridge-lib` for Eve HomeKit types

### Communication Protocol
- Dyson devices communicate via MQTT
- Local network discovery using mDNS
- Encrypted communication with device credentials

## Success Criteria

1. **Functional:** Device discovery, fan control, sensor data
2. **Reliability:** Handles reconnection, offline scenarios
3. **User Experience:** Simple configuration, clear documentation
4. **Quality:** 80%+ test coverage, no critical bugs

## Constraints

- Must work with local network (no cloud dependency for control)
- Must handle Homebridge lifecycle properly
- Must support accessory caching

## Next Steps

1. Complete analysis phase (research protocols, analyze ecosystem)
2. Create PRD with detailed requirements
3. Design architecture
4. Implement in sprints

---

*This context document was generated during BMad Method initialization.*
*Use `/analyst` to continue with the analysis phase.*
