# Workflow: Refactor Code

**Agent:** Developer
**Shortcut:** `*refactor` or `RF`
**Phase:** 4 - Implementation

## Purpose

Refactor existing code to improve quality without changing functionality.

## Refactoring Triggers
- Code review feedback
- Technical debt identified
- Preparation for new features
- Performance improvements needed

## Refactoring Process

### 1. Identify Scope
- [ ] Define what will be refactored
- [ ] Identify affected files
- [ ] Understand current behavior

### 2. Ensure Test Coverage
- [ ] Verify existing tests cover the code
- [ ] Add tests if coverage is insufficient
- [ ] Tests must pass before refactoring

### 3. Refactor in Small Steps
Each step should:
- Be a single, focused change
- Keep tests passing
- Be independently committable

### 4. Common Refactoring Patterns

#### Extract Method
```typescript
// Before
function processDevice() {
  // 50 lines of code
}

// After
function processDevice() {
  validateDevice();
  connectToDevice();
  syncState();
}
```

#### Introduce Interface
```typescript
// Before
class DysonClient { ... }

// After
interface DeviceClient {
  connect(): Promise<void>;
  sendCommand(cmd: Command): Promise<void>;
}
class DysonClient implements DeviceClient { ... }
```

#### Replace Conditionals with Polymorphism
```typescript
// Before
if (device.type === 'fan') { ... }
else if (device.type === 'heater') { ... }

// After
abstract class DysonDevice {
  abstract handleCommand(cmd: Command): void;
}
class DysonFan extends DysonDevice { ... }
class DysonHeater extends DysonDevice { ... }
```

### 5. Verify Changes
- [ ] All tests pass
- [ ] Lint passes
- [ ] Build succeeds
- [ ] Manual testing if needed

### 6. Document
- [ ] Update comments if needed
- [ ] Update architecture docs if structure changed

## Refactoring Checklist

| Step | Status |
|------|--------|
| Scope defined | |
| Tests in place | |
| Refactoring complete | |
| Tests still pass | |
| Lint passes | |
| Build succeeds | |
| Committed | |

## Outputs
- Refactored code
- Updated tests (if needed)
- Commit with clear message

## Next Steps
- Run `*code-review` to verify refactoring
- Update any affected documentation
