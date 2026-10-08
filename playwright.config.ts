import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The core journeys (tagged @core) also run in Firefox and WebKit, Safari's engine (HP2-95).
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@core/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@core/ },
  ],
});
