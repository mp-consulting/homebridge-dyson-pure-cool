# Workflow: Daily Standup

**Agent:** Scrum Master
**Shortcut:** `*daily-standup` or `SU`
**Phase:** 4 - Implementation

## Purpose

Facilitate a quick status check on sprint progress.

## Standup Format

### Questions
1. What was completed since last standup?
2. What is planned for today?
3. Are there any blockers?

### Standup Template

```markdown
## Daily Standup - [Date]

### Completed
- [Story/task completed]
- [Progress made]

### Planned
- [Story/task to work on]
- [Expected progress]

### Blockers
- [Blocker description] - [Potential resolution]
- None

### Notes
- [Any other relevant info]
```

## Sprint Progress Check

### Story Status

| Story | Status | Notes |
|-------|--------|-------|
| S001 | Complete | |
| S002 | In Progress | 60% done |
| S003 | Blocked | Waiting on API docs |
| S004 | Pending | |

### Sprint Burndown

```
Points Remaining
│
10 ├────○
8  ├───────○
6  ├──────────○
4  ├─────────────○
2  ├────────────────○
0  └───────────────────○
   Day 1  2  3  4  5  6
```

### Metrics

| Metric | Value |
|--------|-------|
| Days Remaining | X |
| Points Completed | Y |
| Points Remaining | Z |
| Velocity (current) | V |

## Blocker Escalation

If blocked:
1. Document the blocker
2. Identify owner for resolution
3. Escalate if needed
4. Consider `*correct-course` for significant issues

## Quick Actions

- **Need more context?** Check story file
- **Found a blocker?** Document immediately
- **Scope creep?** Use `*correct-course`
- **Story complete?** Update sprint status

## Outputs
- Standup notes
- Updated sprint status
- Blocker list

## Next Steps
- Continue with planned work
- Address blockers
- Update story status as work progresses
