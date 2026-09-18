import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    timeout: 30_000,
    reuseExistingServer: false
  }
});
