import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

const CI = !!process.env.CI;

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/monkey.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'monkey-report' }]]
    : [['list']],
  outputDir: 'test-results/monkey',
  use: {
    ...base.use,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'monkey-chromium', use: { ...devices['Desktop Chrome'] } }],
});
