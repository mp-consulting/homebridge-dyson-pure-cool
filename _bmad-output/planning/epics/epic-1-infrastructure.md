# Epic 1: Project Infrastructure

| Field | Value |
|-------|-------|
| **Epic ID** | E1 |
| **Title** | Project Infrastructure |
| **Priority** | P0 (Critical Path) |
| **Estimated Points** | 8 |
| **Status** | Ready |

---

## Description

Set up the foundational project infrastructure including TypeScript configuration, build system, testing framework, and CI/CD pipeline. This epic establishes the development environment and quality gates.

## Value Statement

A solid infrastructure ensures code quality, enables testing, and provides confidence for future development. Without this foundation, subsequent epics cannot proceed safely.

## Acceptance Criteria

- [ ] TypeScript project compiles with strict mode
- [ ] ESLint passes with zero warnings
- [ ] Jest test framework is configured and sample test passes
- [ ] GitHub Actions CI runs on Node 20, 22, 24
- [ ] npm scripts for build, lint, test, watch work correctly
- [ ] Package.json has correct metadata for npm publish

## Dependencies

- None (first epic)

## Technical Notes

Refer to architecture document for:
- Directory structure (`src/`, `test/`)
- TypeScript configuration (ES2022 target, ES Modules)
- Testing strategy (Jest with mocks)

---

## Stories

### E1-S1: Configure TypeScript Project

| Field | Value |
|-------|-------|
| **Story ID** | E1-S1 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want a properly configured TypeScript project so that I can write type-safe code with modern features.

#### Acceptance Criteria
- [ ] `tsconfig.json` configured with strict mode enabled
- [ ] ES2022 target, ES Modules output
- [ ] Source maps enabled for debugging
- [ ] `src/` and `dist/` directories properly configured
- [ ] Path aliases work (if used)

#### Technical Notes
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": true
  }
}
```

#### Files to Create/Modify
- `tsconfig.json` - Update configuration
- `src/index.ts` - Entry point
- `src/settings.ts` - Constants

---

### E1-S2: Configure ESLint

| Field | Value |
|-------|-------|
| **Story ID** | E1-S2 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a developer, I want ESLint configured so that code style is consistent and common errors are caught.

#### Acceptance Criteria
- [ ] ESLint 9.x with flat config
- [ ] TypeScript ESLint rules enabled
- [ ] `npm run lint` passes with zero warnings
- [ ] Single quotes, semicolons enforced
- [ ] Max line length: 160 characters

#### Technical Notes
ESLint config already exists, may need minor updates for stricter rules.

#### Files to Create/Modify
- `eslint.config.js` - Update if needed

---

### E1-S3: Configure Jest Testing Framework

| Field | Value |
|-------|-------|
| **Story ID** | E1-S3 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want Jest configured so that I can write and run automated tests.

#### Acceptance Criteria
- [ ] Jest configured for TypeScript (ts-jest or native)
- [ ] `npm test` runs all tests
- [ ] `npm run test:coverage` generates coverage report
- [ ] Coverage thresholds set (80% target)
- [ ] Sample test file passes
- [ ] Mocks directory configured

#### Technical Notes
```typescript
// jest.config.js
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80 }
  }
};
```

#### Files to Create/Modify
- `jest.config.js` - Create
- `test/unit/sample.test.ts` - Sample test
- `package.json` - Add test scripts

---

### E1-S4: Configure GitHub Actions CI

| Field | Value |
|-------|-------|
| **Story ID** | E1-S4 |
| **Points** | 2 |
| **Priority** | P0 |

#### User Story
As a developer, I want CI/CD pipeline so that code quality is verified on every push/PR.

#### Acceptance Criteria
- [ ] GitHub Actions workflow runs on push and PR
- [ ] Tests on Node.js 20.x, 22.x, 24.x
- [ ] Runs lint, build, and test
- [ ] Fails if any step fails
- [ ] Badge shows build status

#### Technical Notes
Existing `.github/workflows/build.yml` needs update for test step.

#### Files to Create/Modify
- `.github/workflows/build.yml` - Update

---

### E1-S5: Update Package Metadata

| Field | Value |
|-------|-------|
| **Story ID** | E1-S5 |
| **Points** | 1 |
| **Priority** | P0 |

#### User Story
As a developer, I want correct package.json metadata so that the plugin can be published to npm.

#### Acceptance Criteria
- [ ] Package name: `homebridge-dyson-pure-cool`
- [ ] Description updated
- [ ] Author and repository URLs correct
- [ ] Keywords include: homebridge-plugin, dyson, homekit
- [ ] Engines specify Node 20+, Homebridge 1.8+/2.0+
- [ ] `private: false` for publishing

#### Files to Create/Modify
- `package.json` - Update metadata
