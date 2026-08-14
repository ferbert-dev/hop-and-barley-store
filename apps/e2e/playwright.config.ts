import { defineConfig, devices } from '@playwright/test';

const screenshotPathTemplate =
  process.platform === 'darwin'
    ? '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}'
    : '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}';

export default defineConfig({
  testDir: './tests',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      pathTemplate: screenshotPathTemplate,
      scale: 'css',
      stylePath: './tests/visual-stability.css',
      threshold: 0.2,
    },
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
