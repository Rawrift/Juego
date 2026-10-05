// E2E con blockchain real (nodo Hardhat): wallet, compra/forja de naves, canje, mercado y Arena
// desde la interfaz. Uso: npm run test:e2e:chain
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

export default defineConfig({
  testDir: './test/e2e-chain',
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    }
  },
  webServer: {
    command: 'npm run build:e2e && node scripts/local-stack.mjs',
    url: 'http://127.0.0.1:4175/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: '4175',
      HOST: '127.0.0.1',
      DATA_DIR: path.join(os.tmpdir(), `riftfall-e2e-chain-${Date.now()}`),
      STATIC_DIR: 'dist-e2e',
      MIN_CLAIM_SHARDS: '5',
      MIN_REALTIME_RATIO: '0.5'
    }
  }
});
