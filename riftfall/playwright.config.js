import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const dataDir = path.join(os.tmpdir(), `riftfall-e2e-${Date.now()}`);

export default defineConfig({
  testDir: './test/e2e',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    locale: 'es-ES',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
    }
  },
  webServer: {
    command: 'npm run build:e2e && node server/index.mjs',
    url: 'http://127.0.0.1:4174/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PORT: '4174', HOST: '127.0.0.1', DATA_DIR: dataDir, DEPLOYMENT_FILE: 'none', STATIC_DIR: 'dist-e2e' }
  }
});
