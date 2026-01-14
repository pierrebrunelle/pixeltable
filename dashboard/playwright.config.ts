import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Pixeltable Dashboard E2E tests.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    // Base URL for the dashboard
    baseURL: 'http://localhost:8080',
    
    // Collect trace on first retry
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Run dashboard server before tests
  webServer: {
    command: 'cd .. && source ../venv/bin/activate && python -c "import pixeltable as pxt; pxt.init(); pxt.dashboard.serve(port=8080, open_browser=False)"',
    url: 'http://localhost:8080/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
