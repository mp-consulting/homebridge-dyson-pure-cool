# Product Requirements Document (PRD)
## homebridge-dyson-pure-cool

| Field | Value |
|-------|-------|
| **Product Name** | homebridge-dyson-pure-cool |
| **Version** | 1.0.0 |
| **Last Updated** | 2025-01-13 |
| **Author** | PM Agent (Jordan) |
| **Status** | Draft |

---

## 1. Overview

### 1.1 Product Summary

A modern, reliable Homebridge plugin that enables Apple HomeKit control of Dyson Pure Cool air purifiers and fans. Built with TypeScript, designed for reliability, and compatible with the latest Node.js and Homebridge versions.

### 1.2 Vision Statement

*"The most reliable way to control your Dyson devices through Apple HomeKit."*

### 1.3 Value Proposition

| Benefit | Description |
|---------|-------------|
| **Modern Platform** | Works with Node.js 20, 22, 24 and Homebridge 2.0 |
| **Reliability** | Automatic reconnection, graceful error handling |
| **Easy Setup** | Auto-discovery, clear configuration UI |
| **Clean Code** | TypeScript strict mode, 80%+ test coverage |

---

## 2. Problem Statement

### 2.1 Current Situation

Homebridge users with Dyson devices face significant challenges:

1. **The dominant plugin fails on modern platforms**
   - `homebridge-dyson-pure-cool` (318 stars) doesn't support Node.js 24
   - Incompatibilities with Homebridge 2.0
   - JavaScript codebase with technical debt

2. **Reliability issues plague users**
   - Authentication failures with Dyson's 2FA
   - Random disconnections without recovery
   - State sync issues between device and HomeKit

3. **Poor user experience**
   - Manual IP configuration required
   - Confusing credential setup process
   - Cryptic error messages

### 2.2 User Impact

> *"Plugin stopped working after updating Node.js. Now I can't control my Dyson from HomeKit at all."*

Users are forced to choose between:
- Staying on outdated Node.js versions
- Losing Dyson HomeKit integration
- Managing complex workarounds

### 2.3 Why Now

- Node.js 24 is now current LTS
- Homebridge 2.0 is production-ready
- User frustration with existing solutions is high
- Protocol and device knowledge is well-documented

---

## 3. Goals and Success Metrics

### 3.1 Primary Goals

| Goal | Description |
|------|-------------|
| **G1** | Full compatibility with Node.js 20, 22, and 24 |
| **G2** | Native Homebridge 2.0 support |
| **G3** | Reliable device communication with automatic recovery |
| **G4** | Intuitive setup with auto-discovery |

### 3.2 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Platform Compatibility** | 100% | CI tests pass on Node 20, 22, 24 |
| **Reliability** | < 1 disconnect/day | User reports, logging |
| **Setup Time** | < 5 minutes | User testing |
| **Test Coverage** | > 80% | Jest coverage report |
| **Critical Bugs** | 0 | GitHub issues (30 days post-launch) |
| **User Satisfaction** | > 4.0/5 | Homebridge UI ratings |

### 3.3 Key Performance Indicators (KPIs)

| KPI | Description | Target |
|-----|-------------|--------|
| Command Latency | Time from HomeKit action to device response | < 500ms |
| State Sync Delay | Time for device state to appear in HomeKit | < 2s |
| Connection Recovery | Time to reconnect after disconnect | < 30s |
| Memory Usage | Plugin memory footprint | < 50MB |

---

## 4. User Personas

### 4.1 Homebridge Power User (Primary)

| Attribute | Description |
|-----------|-------------|
| **Name** | Alex |
| **Technical Level** | High - runs Homebridge on Raspberry Pi or Docker |
| **Goals** | Full control, reliable automation, detailed logging |
| **Pain Points** | Plugin failures, poor documentation, no debugging options |
| **Needs** | Configurable options, clear logs, stable operation |

### 4.2 HomeKit Enthusiast (Secondary)

| Attribute | Description |
|-----------|-------------|
| **Name** | Sam |
| **Technical Level** | Medium - uses Homebridge UI |
| **Goals** | Seamless Apple Home integration |
| **Pain Points** | Complex setup, devices appearing incorrectly |
| **Needs** | Simple config, proper HomeKit representation |

### 4.3 Smart Home Beginner (Tertiary)

| Attribute | Description |
|-----------|-------------|
| **Name** | Jordan |
| **Technical Level** | Low - new to Homebridge |
| **Goals** | "Just want it to work" |
| **Pain Points** | Confusing errors, credential complexity |
| **Needs** | Guided setup, helpful error messages |

---

## 5. User Stories

### Epic 1: Project Infrastructure

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E1-S1 | As a developer, I want a properly configured TypeScript project so that I can write type-safe code | P0 | TypeScript strict mode, ESLint passes |
| E1-S2 | As a developer, I want CI/CD pipeline so that code quality is verified automatically | P0 | GitHub Actions runs on Node 20, 22, 24 |
| E1-S3 | As a developer, I want a test framework so that I can write automated tests | P0 | Jest configured, sample test passes |

### Epic 2: Device Discovery & Connection

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E2-S1 | As a user, I want to enter my Dyson credentials so that the plugin can discover my devices | P0 | Credentials validated, devices retrieved |
| E2-S2 | As a user, I want my devices auto-discovered on the network so that I don't need to enter IPs | P0 | mDNS discovery finds devices within 30s |
| E2-S3 | As a user, I want the plugin to connect to my devices via MQTT so that I can control them | P0 | MQTT connection established, state received |
| E2-S4 | As a user, I want the plugin to reconnect automatically if connection is lost so that I don't need to restart | P0 | Reconnection with backoff, max 3 retries |
| E2-S5 | As a user, I want to manually enter device credentials so that I can use devices with 2FA accounts | P1 | Manual entry in config works |

### Epic 3: Core Fan Control

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E3-S1 | As a user, I want to turn my Dyson fan on/off from HomeKit so that I can control it with Siri | P0 | Power toggle works, state syncs within 2s |
| E3-S2 | As a user, I want to adjust fan speed from HomeKit so that I can control airflow | P0 | Speed 0-100% maps to device 1-10 |
| E3-S3 | As a user, I want to toggle oscillation from HomeKit so that I can distribute airflow | P0 | Oscillation on/off works |
| E3-S4 | As a user, I want the fan to appear as a Fan accessory in HomeKit so that it's properly categorized | P0 | Uses Fanv2 service |

### Epic 4: Environmental Sensors

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E4-S1 | As a user, I want to see room temperature in HomeKit so that I can monitor my environment | P0 | Temperature displays in Celsius/Fahrenheit |
| E4-S2 | As a user, I want to see humidity level in HomeKit so that I can monitor comfort | P0 | Humidity displays as percentage |
| E4-S3 | As a user, I want sensors to update automatically so that readings are current | P0 | Updates every 60 seconds (configurable) |

### Epic 5: Advanced Fan Features

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E5-S1 | As a user, I want to enable auto mode so that the fan adjusts based on air quality | P1 | Auto mode toggle works |
| E5-S2 | As a user, I want to enable night mode so that the fan runs quietly | P1 | Night mode reduces speed/LEDs |
| E5-S3 | As a user, I want to set oscillation angle so that I can control coverage | P2 | Angle presets work |

### Epic 6: Air Quality Monitoring

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E6-S1 | As a user, I want to see overall air quality in HomeKit so that I know when to purify | P1 | AQI displays (Excellent to Poor) |
| E6-S2 | As a user, I want to see PM2.5 levels so that I can monitor particulates | P1 | PM2.5 in µg/m³ |
| E6-S3 | As a user, I want to see PM10 levels so that I can monitor larger particles | P2 | PM10 in µg/m³ |
| E6-S4 | As a user, I want to see VOC index so that I can monitor air purity | P2 | VOC index displayed |

### Epic 7: Filter & Maintenance

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E7-S1 | As a user, I want to see filter life remaining so that I know when to replace | P2 | Percentage and hours displayed |
| E7-S2 | As a user, I want a notification when filter needs replacement so that I don't forget | P2 | FilterChangeIndication triggers |

### Epic 8: Documentation & Release

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E8-S1 | As a user, I want clear README documentation so that I can set up the plugin | P0 | README covers install, config, troubleshooting |
| E8-S2 | As a user, I want a configuration UI in Homebridge so that I can configure without editing JSON | P1 | config.schema.json complete |
| E8-S3 | As a developer, I want the plugin published to npm so that users can install it | P0 | npm publish successful |

---

## 6. Functional Requirements

### 6.1 Device Support

| Req ID | Requirement | Priority | Details |
|--------|-------------|----------|---------|
| FR-001 | Support Pure Cool Tower (TP04, TP07, TP09) | P0 | Product types 438, 438E |
| FR-002 | Support Pure Cool Desk (DP04) | P1 | Product type 475 |
| FR-003 | Support Pure Hot+Cool (HP04, HP07) | P1 | Product types 527, 527E |
| FR-004 | Support Pure Humidify+Cool (PH01, PH03) | P2 | Product types 358, 520 |

### 6.2 Discovery & Connection

| Req ID | Requirement | Priority | Details |
|--------|-------------|----------|---------|
| FR-010 | Retrieve device list from Dyson cloud API | P0 | With user credentials |
| FR-011 | Discover devices via mDNS | P0 | Service `_dyson_mqtt._tcp` |
| FR-012 | Connect to device MQTT broker | P0 | Port 1883, authenticated |
| FR-013 | Handle MQTT reconnection | P0 | Exponential backoff |
| FR-014 | Support manual credential entry | P1 | For 2FA users |
| FR-015 | Cache device credentials locally | P1 | Survive restarts |

### 6.3 Fan Control

| Req ID | Requirement | Priority | Details |
|--------|-------------|----------|---------|
| FR-020 | Control fan power (on/off) | P0 | `fpwr` field |
| FR-021 | Control fan speed (1-10) | P0 | `fnsp` field, map to 0-100% |
| FR-022 | Control oscillation | P0 | `oson` field |
| FR-023 | Control auto mode | P1 | `fmod` = AUTO |
| FR-024 | Control night mode | P1 | `nmod` field |

### 6.4 Sensor Data

| Req ID | Requirement | Priority | Details |
|--------|-------------|----------|---------|
| FR-030 | Read temperature | P0 | `tact` field, convert from Kelvin |
| FR-031 | Read humidity | P0 | `hact` field |
| FR-032 | Read air quality index | P1 | Derived from PM2.5 |
| FR-033 | Read PM2.5 | P1 | `pm25` field |
| FR-034 | Read PM10 | P2 | `pm10` field |
| FR-035 | Read VOC index | P2 | `vact` field |
| FR-036 | Read filter life | P2 | `filf`, `fltf`, `cflr` fields |

### 6.5 HomeKit Integration

| Req ID | Requirement | Priority | Details |
|--------|-------------|----------|---------|
| FR-040 | Register as DynamicPlatformPlugin | P0 | Homebridge API |
| FR-041 | Use Fanv2 service for fan control | P0 | HomeKit standard |
| FR-042 | Use TemperatureSensor service | P0 | HomeKit standard |
| FR-043 | Use HumiditySensor service | P0 | HomeKit standard |
| FR-044 | Use AirQualitySensor service | P1 | HomeKit standard |
| FR-045 | Use FilterMaintenance service | P2 | HomeKit standard |
| FR-046 | Cache accessories correctly | P0 | Homebridge pattern |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Req ID | Requirement | Target |
|--------|-------------|--------|
| NFR-001 | Command response time | < 500ms |
| NFR-002 | State sync delay | < 2 seconds |
| NFR-003 | Plugin startup time | < 5 seconds |
| NFR-004 | Memory usage | < 50MB |
| NFR-005 | CPU usage (idle) | < 1% |

### 7.2 Reliability

| Req ID | Requirement | Target |
|--------|-------------|--------|
| NFR-010 | Automatic reconnection | Within 30 seconds |
| NFR-011 | Uptime | 99.9% (< 9 min/week downtime) |
| NFR-012 | Graceful degradation | Show offline status when disconnected |
| NFR-013 | No data loss | Cached state survives restart |

### 7.3 Compatibility

| Req ID | Requirement | Target |
|--------|-------------|--------|
| NFR-020 | Node.js versions | 20.18+, 22.10+, 24.0+ |
| NFR-021 | Homebridge versions | 1.8.0+, 2.0.0+ |
| NFR-022 | Operating systems | Linux, macOS, Windows |
| NFR-023 | Homebridge UI | Config schema supported |

### 7.4 Security

| Req ID | Requirement | Target |
|--------|-------------|--------|
| NFR-030 | Credentials storage | Not logged, config only |
| NFR-031 | Local communication | No cloud dependency for control |
| NFR-032 | Input validation | All user config validated |

### 7.5 Maintainability

| Req ID | Requirement | Target |
|--------|-------------|--------|
| NFR-040 | Test coverage | > 80% |
| NFR-041 | TypeScript strict mode | Enabled |
| NFR-042 | ESLint compliance | Zero warnings |
| NFR-043 | Documentation | README, CHANGELOG, CONTRIBUTING |

---

## 8. Out of Scope

### 8.1 Explicitly Excluded (v1.0)

| Item | Reason |
|------|--------|
| Dyson 360 Eye/Heurist vacuums | Different product category |
| Non-WiFi devices (BP01 IR) | Requires different protocol |
| Cloud-only control | Complexity, privacy concerns |
| Historical data/graphs | UI complexity |
| Scheduling | Use HomeKit automations instead |
| Heating control (HP models) | v1.1 consideration |
| Humidification control (PH models) | v1.1 consideration |

### 8.2 Future Versions

| Version | Features |
|---------|----------|
| v1.1 | Heating control, humidity control |
| v1.2 | Big+Quiet series (BP02-06) |
| v2.0 | Cloud fallback, extended history |

---

## 9. Dependencies

### 9.1 Technical Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| homebridge | ^1.8.0 \|\| ^2.0.0 | Platform API |
| mqtt | ^5.0.0 | Device communication |
| bonjour-service | ^1.2.0 | mDNS discovery |
| axios | ^1.6.0 | Dyson cloud API |

### 9.2 External Dependencies

| Dependency | Description | Risk |
|------------|-------------|------|
| Dyson Cloud API | For credential retrieval | Medium - API may change |
| Device MQTT Broker | For local control | Low - device firmware |
| Local Network | mDNS, MQTT | Low - user responsibility |

---

## 10. Configuration Schema

```json
{
  "platform": "DysonPureCool",
  "name": "Dyson Pure Cool",
  "email": "user@example.com",
  "password": "••••••••",
  "countryCode": "US",
  "devices": [
    {
      "serial": "ABC-US-12345678",
      "credentials": "base64...",
      "ipAddress": "192.168.1.100",
      "name": "Living Room Fan"
    }
  ],
  "pollingInterval": 60,
  "enableAirQuality": true,
  "enableTemperature": true,
  "enableHumidity": true
}
```

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dyson API changes | Medium | High | Abstract API layer, version detection |
| MQTT connection limits | Medium | Medium | Connection pooling, health checks |
| 2FA complexity | High | Medium | Manual credential option, clear docs |
| New device models | Medium | Low | Extensible device type system |
| Homebridge breaking changes | Low | High | Pin versions, follow updates |

---

## 12. Implementation Priorities

### Phase 1: Foundation (MVP)
- Epic 1: Project Infrastructure
- Epic 2: Device Discovery & Connection
- Epic 3: Core Fan Control

### Phase 2: Sensors
- Epic 4: Environmental Sensors
- Epic 6: Air Quality (P1 items)

### Phase 3: Advanced Features
- Epic 5: Advanced Fan Features
- Epic 7: Filter & Maintenance

### Phase 4: Release
- Epic 8: Documentation & Release

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Homebridge** | Open-source HomeKit bridge |
| **HomeKit** | Apple's smart home framework |
| **MQTT** | Message Queuing Telemetry Transport protocol |
| **mDNS** | Multicast DNS for local service discovery |
| **Fanv2** | HomeKit service type for fans |
| **AQI** | Air Quality Index |
| **PM2.5** | Particulate Matter ≤ 2.5 micrometers |
| **VOC** | Volatile Organic Compounds |

---

## Appendix B: Related Documents

- [Project Brief](./project-brief.md)
- [Dyson Protocol Research](../knowledge/dyson-protocol-research.md)
- [Ecosystem Analysis](../knowledge/ecosystem-analysis.md)
