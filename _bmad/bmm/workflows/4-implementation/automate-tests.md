# Workflow: Automate Tests

**Agent:** Test Architect
**Shortcut:** `*automate-tests` or `AT`
**Phase:** 4 - Implementation

## Purpose

Create automated tests for a completed story to ensure quality and prevent regressions.

## Test Automation Process

### 1. Review Story
- [ ] Understand acceptance criteria
- [ ] Identify testable behaviors
- [ ] Note edge cases mentioned

### 2. Design Tests

#### Test Cases Template
```markdown
## Tests for Story: [ID]

### Test 1: [Name]
- **Given:** [Initial state]
- **When:** [Action]
- **Then:** [Expected outcome]

### Test 2: [Name]
- **Given:** [Initial state]
- **When:** [Action]
- **Then:** [Expected outcome]
```

### 3. Implement Tests

#### Unit Test Example
```typescript
// src/dyson/__tests__/protocol.test.ts

import { encodeCommand, decodeState } from '../protocol';

describe('Protocol', () => {
  describe('encodeCommand', () => {
    it('should encode fan speed command', () => {
      const cmd = encodeCommand({ fanSpeed: 5 });
      expect(cmd.data.fnsp).toBe('0005');
    });

    it('should encode oscillation command', () => {
      const cmd = encodeCommand({ oscillation: true });
      expect(cmd.data.oson).toBe('ON');
    });
  });

  describe('decodeState', () => {
    it('should decode device state correctly', () => {
      const raw = { fnsp: '0003', oson: 'OFF' };
      const state = decodeState(raw);
      expect(state.fanSpeed).toBe(30);
      expect(state.oscillation).toBe(false);
    });
  });
});
```

#### Integration Test Example
```typescript
// src/__tests__/platform.integration.test.ts

import { DysonPlatform } from '../platform';
import { createMockApi, createMockDevice } from './mocks';

describe('DysonPlatform Integration', () => {
  let platform: DysonPlatform;
  let mockApi: MockApi;

  beforeEach(() => {
    mockApi = createMockApi();
    platform = new DysonPlatform(mockApi, testConfig);
  });

  it('should register discovered devices as accessories', async () => {
    const device = createMockDevice('TP04');
    mockDiscovery.mockResolvedValue([device]);

    await platform.discoverDevices();

    expect(mockApi.registerPlatformAccessories).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          UUID: expect.any(String),
        }),
      ]),
    );
  });
});
```

### 4. Test Quality Checklist
- [ ] Tests are independent
- [ ] Tests have clear names
- [ ] Tests use appropriate assertions
- [ ] Tests handle async correctly
- [ ] Tests clean up after themselves

### 5. Run and Verify
```bash
# Run all tests
npm test

# Run specific test file
npm test -- protocol.test.ts

# Run with coverage
npm test -- --coverage
```

## Test Organization

```
test/
├── __mocks__/
│   ├── homebridge.ts
│   └── dyson-device.ts
├── unit/
│   ├── protocol.test.ts
│   └── config.test.ts
├── integration/
│   ├── platform.test.ts
│   └── accessory.test.ts
└── fixtures/
    ├── device-responses.ts
    └── configurations.ts
```

## Outputs
- Test files in `test/` directory
- Updated test coverage
- CI validation

## Next Steps
- Run `*review-coverage` to check coverage
- Add to CI pipeline
- Document test data needs
