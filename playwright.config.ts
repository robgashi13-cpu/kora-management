import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3005',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 12'] } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'wide', use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0',
    port: 3005,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
