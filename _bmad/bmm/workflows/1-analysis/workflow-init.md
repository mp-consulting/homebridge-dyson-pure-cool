# Workflow: Project Initialization

**Agent:** Analyst
**Shortcut:** `*workflow-init` or `WI`
**Phase:** 1 - Analysis

## Purpose

Initialize the project by analyzing the codebase, understanding the scope, and recommending an appropriate planning track for the homebridge-dyson-pure-cool plugin development.

## Planning Tracks

| Track | Scope | Documents | Use Case |
|-------|-------|-----------|----------|
| **Quick Flow** | 1-15 stories | Tech-spec only | Bug fixes, small features |
| **BMad Method** | 10-50+ stories | PRD + Architecture | Full plugin development |
| **Enterprise** | 30+ stories | Full documentation suite | Complex integrations |

## Steps

### 1. Analyze Current State
- [ ] Review existing codebase structure
- [ ] Identify what's already implemented vs template code
- [ ] Assess technical debt or blockers

### 2. Understand Project Scope
- [ ] Define target Dyson devices to support
- [ ] List desired HomeKit features
- [ ] Identify integration complexity

### 3. Recommend Track
Based on analysis, recommend:
- **Quick Flow**: If enhancing existing plugin with 1-3 features
- **BMad Method**: If building full plugin from template
- **Enterprise**: If supporting multiple device families with complex protocols

### 4. Generate Status File
Create `_bmad-output/bmm-workflow-status.yaml` to track progress.

## Outputs
- `_bmad-output/bmm-workflow-status.yaml`
- Recommended planning track
- Initial scope assessment

## Next Steps
- If Quick Flow: Proceed to `*tech-spec`
- If BMad Method: Proceed to `*create-prd` with PM agent
- If Enterprise: Proceed to full documentation workflow
