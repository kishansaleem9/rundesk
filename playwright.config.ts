import { defineConfig, devices } from '@playwright/test'

/**
 * Rundesk end-to-end browser tests.
 *
 * Runs a real Chromium browser against a running Rundesk instance and drives
 * the actual UI — clicking buttons, dragging cards, filling forms, walking
 * full user flows. Point it at any instance via PW_BASE_URL (defaults to prod).
 *
 *   PW_BASE_URL=https://rundesk.theaura.agency \
 *   E2E_EMAIL=test@yopmail.com E2E_PASSWORD=Test@123456 \
 *   npx playwright test
 *
 * Workers=1 and fullyParallel=false on purpose: the specs share one workspace
 * and create/clean real data, so they must not race each other.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  use: {
    baseURL: process.env.PW_BASE_URL || 'https://rundesk.theaura.agency',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
