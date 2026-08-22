import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { manifestScreenshots } from './manifest-screenshot-specs';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const PORT = 4175;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const NOW = new Date('2026-06-24T10:00:00+09:00');

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ORIGIN}/manifest.webmanifest`);
      if (response.ok) return;
    } catch {
      // Retry until the preview server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`preview server at ${ORIGIN} did not become ready in time`);
}

async function seed(page: import('@playwright/test').Page, data: unknown): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((value) => {
    (
      globalThis as unknown as {
        __GOITEI_E2E__?: unknown;
      }
    ).__GOITEI_E2E__ = value;
  }, data);
}

await run('yarn', ['build:e2e']);

const preview = spawn(
  'yarn',
  ['vite', 'preview', '--mode', 'e2e', '--port', `${PORT}`, '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'inherit' },
);

try {
  await waitForServer();

  const browser = await chromium.launch();

  try {
    for (const screenshot of manifestScreenshots) {
      const context = await browser.newContext({
        locale: 'ja-JP',
        viewport: { width: screenshot.width, height: screenshot.height },
      });
      const page = await context.newPage();
      await seed(page, screenshot.seed);
      await page.goto(`${ORIGIN}${screenshot.route}`);
      await page.getByText(screenshot.waitForText).waitFor();
      const png = await page.screenshot();
      await writeFile(root(`public/${screenshot.file}`), png);
      console.log(`public/${screenshot.file}  ${screenshot.width}x${screenshot.height}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  preview.kill('SIGTERM');
}
