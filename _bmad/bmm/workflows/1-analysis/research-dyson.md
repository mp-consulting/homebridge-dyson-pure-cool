# Workflow: Research Dyson Protocols

**Agent:** Analyst
**Shortcut:** `*research-dyson` or `RD`
**Phase:** 1 - Analysis

## Purpose

Research and document Dyson device communication protocols, APIs, and integration methods to inform architecture decisions.

## Research Areas

### 1. Device Discovery
- [ ] Local network discovery (mDNS/Bonjour)
- [ ] Device identification methods
- [ ] Authentication requirements

### 2. Communication Protocols
- [ ] MQTT broker details (local vs cloud)
- [ ] Message formats and payloads
- [ ] Encryption methods
- [ ] Connection lifecycle

### 3. Device Capabilities by Model
- [ ] Pure Cool (TP04, TP07, etc.)
- [ ] Pure Cool Link (TP02, etc.)
- [ ] Pure Hot+Cool (HP04, HP07, etc.)
- [ ] Pure Humidify+Cool (PH01, PH03, etc.)

### 4. State and Commands
- [ ] Fan speed control
- [ ] Oscillation control
- [ ] Air quality sensors
- [ ] Filter status
- [ ] Night mode
- [ ] Auto mode

### 5. Existing Implementations
Review existing open-source implementations:
- [ ] Other Homebridge Dyson plugins
- [ ] Home Assistant integrations
- [ ] Node.js Dyson libraries

## Outputs
- `_bmad-output/knowledge/dyson-protocol-research.md`
- Device capability matrix
- Protocol documentation summary

## Next Steps
After research, proceed to:
- `*analyze-ecosystem` to compare existing solutions
- `*create-brief` to summarize findings
