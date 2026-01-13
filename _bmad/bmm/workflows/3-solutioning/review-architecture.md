# Workflow: Review Architecture

**Agent:** Architect
**Shortcut:** `*review-architecture` or `RA`
**Phase:** 3 - Solutioning

## Purpose

Review and validate architecture decisions before proceeding to implementation.

## Review Checklist

### 1. Requirements Coverage
- [ ] All PRD functional requirements addressed
- [ ] Non-functional requirements considered
- [ ] Edge cases identified and handled

### 2. Design Quality

#### Separation of Concerns
- [ ] Device layer independent of HomeKit layer
- [ ] Configuration separate from business logic
- [ ] Clean interfaces between components

#### Extensibility
- [ ] Easy to add new Dyson device types
- [ ] HomeKit services are modular
- [ ] Configuration is flexible

#### Testability
- [ ] Components can be tested in isolation
- [ ] Mock points identified
- [ ] Integration test strategy defined

### 3. Homebridge Best Practices
- [ ] Uses DynamicPlatformPlugin pattern
- [ ] Accessory caching implemented correctly
- [ ] Proper UUID generation
- [ ] Handles Homebridge lifecycle events

### 4. Error Handling
- [ ] All error scenarios identified
- [ ] Graceful degradation strategies
- [ ] Logging is meaningful
- [ ] User-facing errors are helpful

### 5. Performance
- [ ] Efficient state updates (not polling excessively)
- [ ] Memory usage considered
- [ ] Connection pooling if applicable
- [ ] Startup time acceptable

### 6. Security
- [ ] Credentials stored securely
- [ ] No credentials in logs
- [ ] Local communication preferred
- [ ] Input validation in place

## Review Findings

| Category | Finding | Severity | Recommendation |
|----------|---------|----------|----------------|
| | | Low/Med/High | |

## Decision Record

Document key architectural decisions:

### ADR-001: Local vs Cloud Communication
- **Decision:** Prefer local MQTT when possible
- **Rationale:** Faster, more reliable, works offline
- **Consequences:** Requires local network discovery

### ADR-002: Accessory per Device vs Combined
- **Decision:** Single accessory with multiple services
- **Rationale:** Better HomeKit UX, easier management
- **Consequences:** Must handle service coordination

## Outputs
- Architecture review report
- Decision records
- Updated architecture (if needed)

## Next Steps
If review passes:
- Return to PM for epic creation
- Proceed to implementation

If issues found:
- Address architectural concerns
- Re-review affected areas
