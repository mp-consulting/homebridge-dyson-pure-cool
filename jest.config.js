/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  // Use ts-jest preset for ESM
  preset: 'ts-jest/presets/default-esm',

  // Node test environment for Homebridge plugin
  testEnvironment: 'node',

  // Treat .ts files as ESM
  extensionsToTreatAsEsm: ['.ts'],

  // Module name mapping for ESM imports
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Transform configuration for ts-jest with ESM
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },

  // Test file patterns
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.spec.ts',
  ],

  // Coverage configuration
  // Exclude template files until they are replaced with real implementations
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/platform.ts',           // Template - will be replaced in Epic 2
    '!src/platformAccessory.ts',  // Template - will be replaced in Epic 3
  ],

  coverageDirectory: 'coverage',

  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds (80% target)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Setup files
  setupFilesAfterEnv: [],

  // Module directories
  moduleDirectories: ['node_modules', 'src'],

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,
};
