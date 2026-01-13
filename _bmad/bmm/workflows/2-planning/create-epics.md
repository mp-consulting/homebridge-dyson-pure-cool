# Workflow: Create Epics and User Stories

**Agent:** Product Manager
**Shortcut:** `*create-epics` or `ES`
**Phase:** 2 - Planning

## Purpose

Break down the PRD into well-structured epics and user stories ready for sprint planning.

## Prerequisites
- Completed and validated PRD
- Completed architecture document

## Epic Structure

### Epic Template
```markdown
# Epic: [Name]

## Description
[What this epic accomplishes]

## Value Statement
[Why this epic matters to users]

## Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2

## Dependencies
- [Other epics or external dependencies]

## Stories
[List of stories in this epic]
```

### Story Template
```markdown
# Story: [Name]

## User Story
As a [persona], I want to [action], so that [benefit].

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

## Technical Notes
[Implementation hints from architecture]

## Story Points
[Estimated complexity: 1, 2, 3, 5, 8, 13]

## Dependencies
[Stories this depends on]
```

## Epic Breakdown for homebridge-dyson-pure-cool

### Epic 1: Project Setup & Infrastructure
- Story: Set up TypeScript project structure
- Story: Configure linting and testing
- Story: Set up CI/CD pipeline

### Epic 2: Device Discovery
- Story: Implement local device discovery
- Story: Handle device authentication
- Story: Cache discovered devices

### Epic 3: Device Communication
- Story: Implement MQTT connection
- Story: Handle state updates
- Story: Implement command sending

### Epic 4: HomeKit Integration
- Story: Create platform accessory
- Story: Map fan controls to HomeKit
- Story: Map sensors to HomeKit

### Epic 5: Advanced Features
- Story: Implement night mode
- Story: Add filter status
- Story: Add auto mode

### Epic 6: Documentation & Release
- Story: Write user documentation
- Story: Create configuration guide
- Story: Prepare for npm publish

## Outputs
- `_bmad-output/planning/epics/` folder with epic files
- Story breakdown for each epic
- Dependency graph

## Next Steps
- Run `*implementation-readiness` to validate
- Proceed to `*sprint-planning` with SM agent
