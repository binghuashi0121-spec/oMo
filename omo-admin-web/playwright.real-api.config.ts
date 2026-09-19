import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-real',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm --prefix ../omo-admin-api run start:dev',
      url: 'http://127.0.0.1:3001/api/admin/v1/live',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATA_DRIVER: 'memory',
        DEV_BOOTSTRAP_ADMIN_ENABLED: 'true',
        BOOTSTRAP_ADMIN_USERNAME: 'localadmin',
        BOOTSTRAP_ADMIN_DISPLAY_NAME: '本地联调管理员',
        BOOTSTRAP_ADMIN_PASSWORD: 'Local-Integration-A1',
        COOKIE_SECURE: 'false',
        PORT: '3001',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174/login',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_USE_MOCK: 'false',
      },
    },
  ],
  projects: [
    { name: 'real-api-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
