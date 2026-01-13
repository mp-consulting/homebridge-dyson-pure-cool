# Workflow: Sprint Planning

**Agent:** Scrum Master
**Shortcut:** `*sprint-planning` or `SP`
**Phase:** 4 - Implementation

## Purpose

Plan and kick off a development sprint for the homebridge-dyson-pure-cool plugin.

## Sprint Planning Process

### 1. Review Backlog
- [ ] Review prioritized epics and stories
- [ ] Check story dependencies
- [ ] Verify stories are ready (acceptance criteria, estimates)

### 2. Determine Sprint Capacity
- [ ] Consider available development time
- [ ] Account for any known blockers
- [ ] Factor in testing and review time

### 3. Select Sprint Scope

#### Sprint Goal
Define a clear, achievable goal for this sprint.

#### Selected Stories
Choose stories that:
- Align with sprint goal
- Have clear acceptance criteria
- Dependencies are resolved
- Fit within capacity

### 4. Create Sprint Status File

```yaml
# _bmad-output/implementation/sprint-status.yaml

sprint:
  number: 1
  goal: "Implement core device discovery and connection"
  start_date: YYYY-MM-DD
  end_date: YYYY-MM-DD

stories:
  - id: S001
    title: "Set up TypeScript project structure"
    status: pending
    points: 3

  - id: S002
    title: "Implement device discovery"
    status: pending
    points: 5

metrics:
  total_points: 8
  completed_points: 0
  velocity_target: 8
```

### 5. Define Done Criteria
For this sprint, "done" means:
- [ ] Code is written and compiles
- [ ] Unit tests pass
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Merged to main branch

## Sprint Artifacts

### Sprint Backlog
List of committed stories for this sprint.

### Sprint Board
| To Do | In Progress | In Review | Done |
|-------|-------------|-----------|------|
| | | | |

### Daily Standup Template
- What was completed?
- What's planned today?
- Any blockers?

## Outputs
- `_bmad-output/implementation/sprint-status.yaml`
- Sprint backlog
- Sprint goal statement

## Next Steps
- DEV agent executes `*dev-story` for each story
- Daily standups to track progress
- `*retrospective` at sprint end
