# Workflow: Create Project Brief

**Agent:** Analyst
**Shortcut:** `*create-brief` or `CB`
**Phase:** 1 - Analysis

## Purpose

Synthesize all analysis into a concise project brief that guides the Product Manager in creating the PRD.

## Brief Structure

### 1. Executive Summary
- Project name and purpose
- Target users (Homebridge users with Dyson devices)
- Value proposition

### 2. Problem Statement
- What problem does this plugin solve?
- Why is it needed (gaps in existing solutions)?
- User pain points addressed

### 3. Scope Definition

#### In Scope
- Supported Dyson device models
- HomeKit features to implement
- Platform requirements (Node.js, Homebridge versions)

#### Out of Scope
- Devices/features explicitly not included
- Future considerations vs MVP

### 4. Technical Context
- Communication protocols summary
- Key technical challenges
- Dependencies and constraints

### 5. Success Criteria
- Functional requirements (what it must do)
- Quality requirements (reliability, performance)
- User experience goals

### 6. Risks and Mitigation
- Technical risks
- Compatibility risks
- Maintenance considerations

### 7. Recommended Approach
- Suggested planning track
- Key architectural decisions
- Implementation priorities

## Outputs
- `_bmad-output/planning/project-brief.md`
- Ready for PM to begin PRD creation

## Next Steps
Hand off to Product Manager for `*create-prd` workflow.
