import { defineConfig, devices } from '@playwright/test';

const PORT = 4200; // fixed in scripts/serve-demo.mjs

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Must match the recorder's `attribute` so generated getByTestId() calls resolve.
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
  },
  projects: [
    // Drives the demo app with recording on and saves what the recorder produced.
    { name: 'full-loop', testMatch: 'full-loop/**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
    // Specs written by session-gen (npm run e2e:generate).
    { name: 'generated', testMatch: 'generated/**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node scripts/serve-demo.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
