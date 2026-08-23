import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { E2ESeed } from '@/lib/e2eSeed';
import { manifestScreenshots } from './manifest-screenshot-specs';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
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

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to reserve a preview port')));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForServer(origin: string, preview: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 30_000;
  let exited = false;
  let exitCode: number | null = null;
  let spawnError: Error | null = null;
  preview.once('exit', (code) => {
    exited = true;
    exitCode = code;
  });
  preview.once('error', (error) => {
    spawnError = error;
  });

  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (exited) {
      throw new Error(
        `preview server exited before becoming ready${exitCode === null ? '' : ` (${exitCode})`}`,
      );
    }
    try {
      const response = await fetch(`${origin}/manifest.webmanifest`);
      if (response.ok) return;
    } catch {
      // Retry until the preview server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`preview server at ${origin} did not become ready in time`);
}

async function stopPreview(preview: ReturnType<typeof spawn>): Promise<void> {
  if (preview.exitCode !== null || preview.signalCode !== null) return;
  const closed = new Promise<void>((resolve) => {
    preview.once('close', () => resolve());
    preview.once('exit', () => resolve());
  });
  preview.kill('SIGTERM');
  await Promise.race([
    closed,
    new Promise<void>((resolve) =>
      setTimeout(() => {
        if (preview.exitCode === null && preview.signalCode === null) preview.kill('SIGKILL');
        resolve();
      }, 5000),
    ),
  ]);
}

async function seed(page: import('@playwright/test').Page, data: E2ESeed): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((value) => {
    (
      globalThis as {
        __GOITEI_E2E__?: E2ESeed;
      }
    ).__GOITEI_E2E__ = value;
  }, data);
}

await run('yarn', ['build:e2e']);

const PORT = await reservePort();
const ORIGIN = `http://127.0.0.1:${PORT}`;

const preview = spawn(
  'yarn',
  ['vite', 'preview', '--mode', 'e2e', '--port', `${PORT}`, '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'inherit' },
);

try {
  await waitForServer(ORIGIN, preview);

  const browser = await chromium.launch();

  try {
    for (const screenshot of manifestScreenshots) {
      const context = await browser.newContext({
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
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
  await stopPreview(preview);
}
