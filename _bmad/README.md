# BMad Method for homebridge-dyson-pure-cool

This project uses the **BMad Method** - an AI-driven agile development framework for structured software development.

## Quick Start

### Using Claude Code

Load an agent using slash commands:

```
/bmad       - Overview and getting started
/analyst    - Analysis & research
/pm         - Product management
/architect  - Software architecture
/dev        - Development
/sm         - Scrum master
/tea        - Test architecture
/tech-writer - Documentation
```

### Recommended Flow

1. **Start with Analysis:** `/analyst` → `*workflow-init`
2. **Create Requirements:** `/pm` → `*create-prd`
3. **Design Architecture:** `/architect` → `*create-architecture`
4. **Plan Sprint:** `/sm` → `*sprint-planning`
5. **Implement:** `/dev` → `*dev-story`
6. **Test:** `/tea` → `*automate-tests`

## Directory Structure

```
_bmad/
├── core/                    # Core configuration
│   ├── config.yaml          # Project settings
│   └── module.yaml          # Core module definition
└── bmm/                     # BMad Method module
    ├── agents/              # Agent definitions
    │   ├── analyst.agent.yaml
    │   ├── pm.agent.yaml
    │   ├── architect.agent.yaml
    │   ├── dev.agent.yaml
    │   ├── sm.agent.yaml
    │   ├── tea.agent.yaml
    │   └── tech-writer.agent.yaml
    ├── workflows/           # Workflow definitions
    │   ├── 1-analysis/
    │   ├── 2-planning/
    │   ├── 3-solutioning/
    │   └── 4-implementation/
    └── module.yaml          # BMM module definition

_bmad-output/                # Generated artifacts
├── planning/                # PRD, architecture, epics
├── implementation/          # Sprints, stories
├── knowledge/               # Research, references
└── bmm-workflow-status.yaml # Progress tracking

.claude/
└── commands/                # Claude Code slash commands
    ├── bmad.md
    ├── analyst.md
    ├── pm.md
    ├── architect.md
    ├── dev.md
    ├── sm.md
    ├── tea.md
    └── tech-writer.md
```

## Development Phases

### Phase 1: Analysis
- Research Dyson protocols
- Analyze existing plugins
- Create project brief

### Phase 2: Planning
- Create PRD
- Define epics and stories
- Validate requirements

### Phase 3: Solutioning
- Design architecture
- Design device communication
- Design HomeKit mapping

### Phase 4: Implementation
- Sprint planning
- Story implementation
- Testing and review
- Documentation

## Tracking Progress

Check `_bmad-output/bmm-workflow-status.yaml` for current progress.

## Learn More

- [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD)
- [BMad Documentation](https://docs.bmad-method.org)
