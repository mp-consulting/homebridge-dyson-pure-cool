# Workflow: Develop Story

**Agent:** Developer
**Shortcut:** `*dev-story` or `DS`
**Phase:** 4 - Implementation

## Purpose

Implement a user story following the project's coding standards and architectural patterns.

## Development Process

### 1. Preparation
- [ ] Read story file completely
- [ ] Understand acceptance criteria
- [ ] Review related architecture docs
- [ ] Check dependencies are complete

### 2. Implementation Steps

#### 2.1 Create/Update Files
Follow the architecture and create necessary files:
- Source files in `src/`
- Test files in `test/`
- Type definitions if needed

#### 2.2 Coding Standards
- Use TypeScript strict mode
- Follow ESLint rules (single quotes, semicolons)
- Max line length: 160 characters
- Use meaningful variable names
- Add JSDoc comments for public APIs

#### 2.3 Homebridge Patterns
```typescript
// Proper characteristic handler pattern
this.service.getCharacteristic(this.platform.Characteristic.On)
  .onGet(this.handleOnGet.bind(this))
  .onSet(this.handleOnSet.bind(this));

private async handleOnGet(): Promise<CharacteristicValue> {
  this.platform.log.debug('Get On state');
  return this.state.isOn;
}

private async handleOnSet(value: CharacteristicValue): Promise<void> {
  this.platform.log.debug('Set On to:', value);
  await this.device.setOn(value as boolean);
  this.state.isOn = value as boolean;
}
```

### 3. Testing
- [ ] Write unit tests for new code
- [ ] Ensure existing tests pass
- [ ] Test edge cases from acceptance criteria

### 4. Verification
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm run build` - compiles successfully
- [ ] Run tests - all pass
- [ ] Manual testing if applicable

### 5. Commit
```bash
git add .
git commit -m "feat: [description of changes]

- Implements [story ID]
- [Key implementation details]"
```

## Implementation Checklist

| Step | Status |
|------|--------|
| Story understood | |
| Files created/modified | |
| Code complete | |
| Tests written | |
| Lint passes | |
| Build passes | |
| Tests pass | |
| Committed | |

## Common Patterns

### Error Handling
```typescript
try {
  await this.device.connect();
} catch (error) {
  this.platform.log.error('Connection failed:', error);
  throw new this.platform.api.hap.HapStatusError(
    this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
  );
}
```

### Logging
```typescript
this.platform.log.debug('Debug message');
this.platform.log.info('Info message');
this.platform.log.warn('Warning message');
this.platform.log.error('Error message');
```

## Outputs
- Implemented code
- Test files
- Updated story status

## Next Steps
- Run `*code-review` to validate
- TEA agent runs `*automate-tests` if needed
- SM updates sprint status
