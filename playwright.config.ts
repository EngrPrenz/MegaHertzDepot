import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w @countwise/server',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      env: {
        FORCE_IN_MEMORY_DB: 'true',
      },
    },
    {
      command: 'npm run dev -w @countwise/client',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

