# Workflow: Create Story

**Agent:** Scrum Master
**Shortcut:** `*create-story` or `CS`
**Phase:** 4 - Implementation

## Purpose

Create a detailed story file with all information needed for implementation.

## Story Template

```markdown
# Story: [Story Title]

## Metadata
- **ID:** S###
- **Epic:** [Parent Epic]
- **Priority:** High/Medium/Low
- **Points:** [Estimate]
- **Status:** pending

## User Story
As a [user type],
I want to [action],
So that [benefit].

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

## Technical Notes
[Implementation guidance from architecture]

### Files to Create/Modify
- `src/[file].ts` - [description]
- `test/[file].test.ts` - [description]

### Dependencies
- [Other stories or components]

### Implementation Hints
- [Key patterns to follow]
- [Edge cases to handle]
- [Testing approach]

## Definition of Done
- [ ] Implementation complete
- [ ] Unit tests written and passing
- [ ] Lint checks pass
- [ ] Code reviewed
- [ ] Documentation updated

## Notes
[Additional context or considerations]
```

## Story Creation Checklist

### Before Creating
- [ ] Epic exists in planning folder
- [ ] Story is in prioritized backlog
- [ ] Dependencies are identified

### During Creation
- [ ] User story is clear and valuable
- [ ] Acceptance criteria are testable
- [ ] Technical notes are sufficient
- [ ] Definition of done is clear

### After Creation
- [ ] Story file saved to correct location
- [ ] Sprint status updated
- [ ] Dependencies flagged

## Outputs
- `_bmad-output/implementation/stories/[story-id].md`
- Updated sprint status

## Next Steps
- DEV agent executes `*dev-story` to implement
- TEA agent creates tests with `*automate-tests`
