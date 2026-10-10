/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 15000,
  verbose: true,
  maxWorkers: 1, // Run integration tests sequentially on test database to avoid race conditions
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/db/seed.js', '!src/db/setup.js'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/algo/**/*.js': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
