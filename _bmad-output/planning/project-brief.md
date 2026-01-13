# Project Brief: homebridge-dyson-pure-cool

**Date:** 2025-01-13
**Agent:** Analyst (Alex)
**Status:** Ready for PRD Creation

---

## 1. Executive Summary

**Project:** homebridge-dyson-pure-cool
**Purpose:** A modern, reliable Homebridge plugin for Dyson Pure Cool air purifiers and fans
**Target Users:** Homebridge users with Dyson WiFi-enabled devices

### Value Proposition

A next-generation Homebridge plugin that provides:
- **Modern platform support** (Node.js 24+, Homebridge 2.0)
- **Improved reliability** (reconnection, error handling)
- **Better user experience** (auto-discovery, clear errors)
- **Clean architecture** (TypeScript, ES Modules, tested)

---

## 2. Problem Statement

### Current Situation

The existing [homebridge-dyson-pure-cool](https://github.com/lukasroegner/homebridge-dyson-pure-cool) plugin dominates the market (318 stars, verified) but suffers from:

1. **Platform Incompatibility**
   - Fails on Node.js 24
   - Issues with Homebridge 2.0
   - Legacy JavaScript codebase

2. **Reliability Issues**
   - Authentication failures (2FA problems)
   - Random disconnections without recovery
   - Poor state synchronization

3. **User Experience Gaps**
   - Manual IP address configuration required
   - Confusing credential setup
   - Unclear error messages

### Why This Matters

Users are frustrated. The most popular plugin doesn't work with modern Node.js versions, leaving users stuck on older platforms or without Dyson integration.

---

## 3. Scope Definition

### In Scope (MVP)

#### Supported Devices
| Series | Models | Priority |
|--------|--------|----------|
| Pure Cool Tower | TP04, TP07, TP09 | P0 |
| Pure Cool Desk | DP04 | P1 |
| Pure Hot+Cool | HP04, HP07 | P1 |
| Pure Humidify+Cool | PH01, PH03 | P2 |

#### Features
| Feature | HomeKit Service | Priority |
|---------|-----------------|----------|
| Fan On/Off | Fanv2 | P0 |
| Fan Speed | Fanv2 | P0 |
| Oscillation | Fanv2 | P0 |
| Auto Mode | Fanv2 | P1 |
| Night Mode | Switch | P1 |
| Temperature | TemperatureSensor | P0 |
| Humidity | HumiditySensor | P0 |
| Air Quality | AirQualitySensor | P1 |
| Filter Status | FilterMaintenance | P2 |

#### Platform Requirements
| Requirement | Version |
|-------------|---------|
| Node.js | 20, 22, 24 |
| Homebridge | 1.8+, 2.0 |
| TypeScript | 5.x |
| ES Modules | Required |

### Out of Scope (v1.0)

- Dyson 360 Eye/Heurist robot vacuums
- Non-WiFi devices (BP01 with IR)
- Dyson cloud API control (local only)
- HomeKit automations/scenes (user-configured)
- Mobile app or web dashboard

### Future Considerations (v2.0+)

- Big+Quiet series (BP02-06)
- Scheduling features
- Historical data/graphs
- Cloud fallback option

---

## 4. Technical Context

### Communication Protocol

```
┌──────────────────┐         MQTT          ┌──────────────────┐
│   Plugin         │ ◄──────────────────► │   Dyson Device   │
│   (MQTT Client)  │      Port 1883        │   (MQTT Broker)  │
└──────────────────┘                       └──────────────────┘
```

- **Discovery:** mDNS service `_dyson_mqtt._tcp`
- **Authentication:** Device credentials (hashed password)
- **Topics:** `{productType}/{serial}/status/current`, `{productType}/{serial}/command`

### Key Technical Challenges

| Challenge | Mitigation |
|-----------|------------|
| Credential acquisition | Cloud API + manual entry option |
| MQTT connection limits | Connection pooling, graceful handling |
| Firmware bugs (TP07, HP07) | Reconnection with backoff |
| Keep-alive requirements | 30-second polling mechanism |
| Device variants | Abstracted device protocol layer |

### Dependencies

| Dependency | Purpose |
|------------|---------|
| homebridge | Platform API |
| mqtt | Device communication |
| bonjour-service | mDNS discovery |
| homebridge-lib | Eve HomeKit types (optional) |

---

## 5. Success Criteria

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Discover Dyson devices on local network | P0 |
| F2 | Connect to devices via MQTT | P0 |
| F3 | Control fan power and speed | P0 |
| F4 | Display temperature in HomeKit | P0 |
| F5 | Display humidity in HomeKit | P0 |
| F6 | Control oscillation | P0 |
| F7 | Display air quality sensors | P1 |
| F8 | Support auto mode | P1 |
| F9 | Support night mode | P1 |
| F10 | Display filter status | P2 |

### Quality Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| Q1 | Test coverage | 80%+ |
| Q2 | Zero critical bugs | 30 days post-launch |
| Q3 | TypeScript strict mode | Enabled |
| Q4 | ESLint clean | Zero warnings |
| Q5 | Documentation | README + troubleshooting |

### User Experience Goals

| Goal | Metric |
|------|--------|
| Easy setup | < 5 minutes for basic config |
| Reliable operation | < 1 disconnection per day |
| Clear errors | Actionable error messages |
| Fast response | < 500ms command latency |

---

## 6. Risks and Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dyson changes protocol | Low | High | Abstract protocol layer |
| MQTT connection limits | Medium | Medium | Connection management |
| 2FA complexity | High | Medium | Manual credential option |
| Device firmware bugs | Medium | Medium | Reconnection logic |

### Compatibility Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| New Dyson models | Medium | Low | Extensible device types |
| Homebridge breaking changes | Low | High | Follow Homebridge updates |
| Node.js deprecations | Low | Low | Regular dependency updates |

### Maintenance Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Single maintainer | Medium | High | Good documentation |
| Issue volume | Medium | Medium | Clear contribution guide |
| Dependency vulnerabilities | Low | Medium | Automated security scans |

---

## 7. Recommended Approach

### Planning Track

**BMad Method** - Full PRD + Architecture approach

Rationale:
- Greenfield project from template
- Estimated 25-40 user stories
- Requires proper architecture design
- Protocol abstraction layer needed

### Architecture Priorities

1. **Device Protocol Abstraction**
   - Separate Dyson communication from HomeKit mapping
   - Support multiple device types through inheritance
   - Enable testing with mock devices

2. **Reliability First**
   - Reconnection with exponential backoff
   - Connection health monitoring
   - Graceful degradation

3. **Modern TypeScript**
   - Strict mode, ES Modules
   - Comprehensive types
   - Clean, documented code

### Implementation Order

1. **Epic 1:** Project setup, infrastructure
2. **Epic 2:** Device discovery and connection
3. **Epic 3:** Core fan controls (on/off, speed)
4. **Epic 4:** Environmental sensors (temp, humidity)
5. **Epic 5:** Advanced features (oscillation, modes)
6. **Epic 6:** Air quality sensors
7. **Epic 7:** Documentation and release

---

## 8. Next Steps

1. **PM Agent (`/pm`):** Create PRD from this brief
2. **Architect Agent (`/architect`):** Design system architecture
3. **SM Agent (`/sm`):** Plan first sprint
4. **DEV Agent (`/dev`):** Begin implementation

---

## Appendix: Research Documents

- [Dyson Protocol Research](./../knowledge/dyson-protocol-research.md)
- [Ecosystem Analysis](./../knowledge/ecosystem-analysis.md)
- [Project Context](./project-context.md)
