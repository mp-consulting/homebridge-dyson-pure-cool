import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'homebridge-ui/server.js', 'homebridge-ui/assistant.js'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**'],
    },
  },
  oxc: {
    target: 'es2022',
  },
});
