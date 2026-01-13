# Workflow: Create Test Strategy

**Agent:** Test Architect
**Shortcut:** `*create-test-strategy` or `TS`
**Phase:** 4 - Implementation

## Purpose

Define a comprehensive test strategy for the homebridge-dyson-pure-cool plugin.

## Test Strategy Document

### 1. Testing Objectives
- Ensure plugin reliability
- Verify HomeKit integration correctness
- Validate Dyson protocol handling
- Catch regressions early

### 2. Test Levels

#### Unit Tests
- **Scope:** Individual functions and classes
- **Tools:** Jest or Vitest
- **Coverage Target:** 80%+

```typescript
describe('DysonProtocol', () => {
  it('should decode fan speed correctly', () => {
    expect(decodeFanSpeed('0005')).toBe(50);
  });
});
```

#### Integration Tests
- **Scope:** Component interactions
- **Tools:** Jest with mock devices
- **Focus:** Platform ↔ Device communication

```typescript
describe('Platform Integration', () => {
  it('should discover and register devices', async () => {
    const mockApi = createMockHomebridgeApi();
    const platform = new DysonPlatform(mockApi, config);
    await platform.discoverDevices();
    expect(platform.accessories.length).toBe(2);
  });
});
```

#### Manual Testing
- **Scope:** End-to-end with real devices
- **When:** Before releases
- **Checklist:** See manual test plan

### 3. Test Categories

| Category | Description | Examples |
|----------|-------------|----------|
| Happy Path | Normal usage | Turn fan on/off |
| Error Handling | Failure scenarios | Device offline |
| Edge Cases | Boundary conditions | Max/min values |
| Regression | Previously fixed bugs | Issue #123 |

### 4. Mock Strategy

#### Device Mock
```typescript
class MockDysonDevice {
  state: DeviceState = defaultState;

  async connect(): Promise<void> { }
  async sendCommand(cmd: Command): Promise<void> {
    // Update mock state
  }
  emit(event: string, data: any): void { }
}
```

#### Homebridge API Mock
```typescript
const mockApi = {
  hap: { Service, Characteristic },
  on: jest.fn(),
  registerPlatformAccessories: jest.fn(),
};
```

### 5. CI/CD Integration
- Run tests on every PR
- Required checks before merge
- Coverage reporting

### 6. Test Data
- Sample device responses
- Configuration variations
- Error response payloads

## Testing Matrix

| Feature | Unit | Integration | Manual |
|---------|------|-------------|--------|
| Discovery | ✓ | ✓ | ✓ |
| Connection | ✓ | ✓ | ✓ |
| Fan Control | ✓ | ✓ | ✓ |
| Sensors | ✓ | ✓ | ✓ |
| Error Handling | ✓ | ✓ | - |

## Outputs
- Test strategy document
- Test setup guide
- Mock implementation guide

## Next Steps
- Implement test infrastructure
- Use `*automate-tests` for story tests
- Run `*review-coverage` periodically
