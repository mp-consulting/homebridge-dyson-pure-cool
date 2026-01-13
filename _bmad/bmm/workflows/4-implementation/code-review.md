# Workflow: Code Review

**Agent:** Developer
**Shortcut:** `*code-review` or `CR`
**Phase:** 4 - Implementation

## Purpose

Review implemented code for quality, correctness, and adherence to project standards.

## Review Checklist

### 1. Functionality
- [ ] Code implements all acceptance criteria
- [ ] Edge cases are handled
- [ ] Error handling is appropriate
- [ ] No obvious bugs

### 2. Code Quality
- [ ] Code is readable and self-documenting
- [ ] Functions are focused and appropriately sized
- [ ] No code duplication
- [ ] Naming is clear and consistent

### 3. TypeScript Standards
- [ ] Types are properly defined (no `any` abuse)
- [ ] Interfaces used for contracts
- [ ] Nullability handled correctly
- [ ] Generic types used appropriately

### 4. Homebridge Patterns
- [ ] Follows platform plugin patterns
- [ ] Characteristic handlers are correct
- [ ] Caching is handled properly
- [ ] Logging is appropriate

### 5. Testing
- [ ] Unit tests exist for new code
- [ ] Tests cover happy path and error cases
- [ ] Test names describe what they test
- [ ] No flaky tests

### 6. Security
- [ ] No credentials in code
- [ ] Input is validated
- [ ] No injection vulnerabilities
- [ ] Sensitive data not logged

### 7. Performance
- [ ] No unnecessary operations
- [ ] Async operations are efficient
- [ ] Memory usage is reasonable
- [ ] No busy loops or excessive polling

## Review Findings Template

```markdown
## Code Review: [Story ID]

### Summary
[Brief overview of changes reviewed]

### Findings

#### Critical (Must Fix)
- [ ] [Issue description and recommendation]

#### Major (Should Fix)
- [ ] [Issue description and recommendation]

#### Minor (Consider Fixing)
- [ ] [Issue description and recommendation]

#### Positive Observations
- [Good patterns observed]

### Verdict
- [ ] Approved
- [ ] Approved with comments
- [ ] Changes requested
```

## Review Categories

| Category | Status | Notes |
|----------|--------|-------|
| Functionality | Pass/Fail | |
| Code Quality | Pass/Fail | |
| TypeScript | Pass/Fail | |
| Homebridge | Pass/Fail | |
| Testing | Pass/Fail | |
| Security | Pass/Fail | |
| Performance | Pass/Fail | |

## Outputs
- Code review report
- List of required changes (if any)
- Approval status

## Next Steps
If approved:
- Merge changes
- Update story to complete
- Update sprint status

If changes requested:
- Developer addresses feedback
- Re-review required changes
