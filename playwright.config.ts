import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the local demo: the real Replyze widget.js (from
 * cdn.replyze.chat, or REPLYZE_WIDGET_SRC) in a real browser, on the demo
 * store, against the scripted stand-in API. No Replyze account is used.
 */
const PORT = 4302;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node demo/server.ts',
    env: { DEMO_PORT: String(PORT), REPLYZE_WIDGET_TOKEN: '' },
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
