# Workflow: Fix Bug

**Agent:** Developer
**Shortcut:** `*fix-bug` or `FB`
**Phase:** 4 - Implementation

## Purpose

Systematically diagnose and fix reported bugs in the plugin.

## Bug Fix Process

### 1. Understand the Bug
- [ ] Read bug report thoroughly
- [ ] Identify expected vs actual behavior
- [ ] Determine reproduction steps
- [ ] Check if already fixed or duplicate

### 2. Reproduce the Bug
- [ ] Set up environment matching report
- [ ] Follow reproduction steps
- [ ] Confirm bug is reproducible
- [ ] Note any variations observed

### 3. Diagnose Root Cause
- [ ] Add logging if needed
- [ ] Trace execution path
- [ ] Identify the exact failure point
- [ ] Understand why it fails

### 4. Write Failing Test
```typescript
describe('Bug #123: Fan speed not updating', () => {
  it('should update fan speed when command received', async () => {
    // Arrange
    const device = new MockDysonDevice();
    const accessory = new FanAccessory(device);

    // Act
    await device.emit('state', { fnsp: '0005' });

    // Assert
    expect(accessory.currentSpeed).toBe(50);
  });
});
```

### 5. Implement Fix
- [ ] Make minimal changes to fix the bug
- [ ] Avoid scope creep
- [ ] Consider edge cases
- [ ] Don't break other functionality

### 6. Verify Fix
- [ ] New test passes
- [ ] All existing tests pass
- [ ] Bug no longer reproducible
- [ ] Related functionality works

### 7. Document
- [ ] Update changelog
- [ ] Add code comments if needed
- [ ] Close related issues

## Bug Report Template

```markdown
## Bug Fix: [Issue #]

### Problem
[Description of the bug]

### Root Cause
[What caused the bug]

### Solution
[How it was fixed]

### Testing
- [Test that verifies the fix]

### Related
- Issue: #123
- Affected versions: 1.0.0-1.0.3
```

## Commit Message Format
```
fix: [brief description]

Fixes #123

- Root cause: [explanation]
- Solution: [what was changed]
```

## Bug Severity Guide

| Severity | Description | Response |
|----------|-------------|----------|
| Critical | Plugin crash, data loss | Immediate fix |
| Major | Feature broken | Fix in current sprint |
| Minor | Inconvenience, workaround exists | Schedule for backlog |
| Trivial | Cosmetic, edge case | Low priority |

## Outputs
- Fixed code
- New test(s)
- Updated changelog
- Closed issue

## Next Steps
- Run `*code-review` to verify fix
- Update release notes
- Consider if regression tests needed
