# Epic 8: Documentation & Release

| Field | Value |
|-------|-------|
| **Epic ID** | E8 |
| **Title** | Documentation & Release |
| **Priority** | P0 |
| **Estimated Points** | 5 |
| **Status** | Ready |

---

## Description

Create comprehensive documentation and prepare for npm publication. Good documentation is essential for user adoption and reducing support burden.

## Value Statement

Clear documentation enables users to install and configure the plugin successfully, reducing frustration and support requests.

## Acceptance Criteria

- [ ] README covers installation, configuration, troubleshooting
- [ ] Configuration UI works in Homebridge
- [ ] CHANGELOG documents version history
- [ ] Plugin published to npm
- [ ] Verified plugin badge (stretch goal)

## Dependencies

- All other epics (functionality complete)

## Technical Notes

Refer to architecture document for:
- Configuration schema (`config.schema.json`)
- Package metadata

---

## Stories

### E8-S1: Write README Documentation

| Field | Value |
|-------|-------|
| **Story ID** | E8-S1 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a user, I want clear README documentation so that I can set up the plugin successfully.

#### Acceptance Criteria
- [ ] Installation instructions (npm, HOOBS)
- [ ] Configuration options explained
- [ ] Supported devices listed
- [ ] Troubleshooting section
- [ ] Screenshots of HomeKit (optional)
- [ ] Badges (build status, npm version)

#### README Structure
```markdown
# homebridge-dyson-pure-cool

## Features
## Supported Devices
## Installation
## Configuration
### Using Dyson Account
### Manual Device Configuration
## Troubleshooting
## Contributing
## License
```

#### Files to Create/Modify
- `README.md` - Complete rewrite

---

### E8-S2: Create Configuration Schema

| Field | Value |
|-------|-------|
| **Story ID** | E8-S2 |
| **Points** | 1 |
| **Priority** | P1 |

#### User Story
As a user, I want a configuration UI in Homebridge so that I can configure without editing JSON.

#### Acceptance Criteria
- [ ] `config.schema.json` complete
- [ ] All config options exposed
- [ ] Proper input types (password, number, boolean)
- [ ] Helpful descriptions
- [ ] Works in Homebridge Config UI X

#### Technical Notes
See architecture document for full schema.

#### Files to Create/Modify
- `config.schema.json` - Update

---

### E8-S3: Write Troubleshooting Guide

| Field | Value |
|-------|-------|
| **Story ID** | E8-S3 |
| **Points** | 1 |
| **Priority** | P1 |

#### User Story
As a user having issues, I want a troubleshooting guide so that I can solve common problems.

#### Acceptance Criteria
- [ ] Common issues documented
- [ ] Error messages explained
- [ ] Debug logging instructions
- [ ] How to report issues

#### Common Issues
- Device not discovered
- Authentication failed
- Device shows "Not Responding"
- Sensors not updating
- 2FA account setup

#### Files to Create/Modify
- `README.md` - Troubleshooting section
- (Optional) `docs/TROUBLESHOOTING.md`

---

### E8-S4: Prepare npm Publication

| Field | Value |
|-------|-------|
| **Story ID** | E8-S4 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a developer, I want the plugin published to npm so that users can install it.

#### Acceptance Criteria
- [ ] Package name available on npm
- [ ] `private: false` in package.json
- [ ] Version set to 1.0.0
- [ ] `.npmignore` excludes dev files
- [ ] `npm publish` succeeds
- [ ] Package appears on npmjs.com

#### Pre-publish Checklist
- [ ] All tests pass
- [ ] Lint passes
- [ ] Build succeeds
- [ ] README is complete
- [ ] CHANGELOG has 1.0.0 entry

#### Files to Create/Modify
- `package.json` - Final updates
- `.npmignore` - Verify exclusions
- `CHANGELOG.md` - Create with 1.0.0
