// @ts-check
const { defineConfig, devices } = require('./backend/node_modules/@playwright/test');

/**
 * Zipli Pro — Playwright End-to-End Test Configuration
 * Phase 11 Premium Frontend
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5678',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-1280',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'mobile-360',
      use: {
        viewport: { width: 360, height: 640 },
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: 'PORT=5678 npm start',
    cwd: './backend',
    port: 5678,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
