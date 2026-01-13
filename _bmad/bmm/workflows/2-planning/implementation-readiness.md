# Workflow: Implementation Readiness Review

**Agent:** Product Manager
**Shortcut:** `*implementation-readiness` or `IR`
**Phase:** 2 - Planning

## Purpose

Conduct a final review to ensure all planning artifacts are complete, coherent, and the project is ready to begin implementation.

## Readiness Checklist

### 1. Documentation Complete
- [ ] Project brief exists and is current
- [ ] PRD is complete and validated
- [ ] Architecture document is complete
- [ ] Epics and stories are defined

### 2. Coherence Check
- [ ] Architecture supports all PRD requirements
- [ ] Stories trace back to PRD requirements
- [ ] No orphan features (in arch but not PRD)
- [ ] Dependencies are properly sequenced

### 3. Technical Readiness
- [ ] Development environment documented
- [ ] Build/test scripts defined
- [ ] CI/CD pipeline configured
- [ ] Required APIs/protocols understood

### 4. Story Readiness
- [ ] All stories have acceptance criteria
- [ ] Stories are appropriately sized
- [ ] Dependencies between stories identified
- [ ] First sprint's stories are fully detailed

### 5. Risk Assessment
- [ ] Technical risks identified
- [ ] Mitigation strategies defined
- [ ] Fallback options considered
- [ ] Unknown areas flagged for spikes

## Readiness Matrix

| Area | Status | Notes |
|------|--------|-------|
| PRD | Ready/Not Ready | |
| Architecture | Ready/Not Ready | |
| Epics | Ready/Not Ready | |
| Stories | Ready/Not Ready | |
| Environment | Ready/Not Ready | |
| CI/CD | Ready/Not Ready | |

## Go/No-Go Decision

Based on the review:
- **GO:** All critical items pass, proceed to implementation
- **NO-GO:** Address blocking items before proceeding

## Outputs
- Implementation readiness report
- Action items for any gaps
- Recommended first sprint scope

## Next Steps
If GO:
- Hand off to SM for `*sprint-planning`
- Begin first sprint with DEV agent

If NO-GO:
- Address identified gaps
- Re-run readiness review
