import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';
import { icons } from './icon-specs';

/**
 * Rasterises `public/favicon.svg` into the PNG icons the web app manifest and
 * iOS refer to.
 *
 *   yarn icons
 *
 * The PNGs are committed, because a manifest whose icons are built on demand is
 * a manifest that is broken in every checkout that has not run this. What they
 * are not is a second source: the mark lives in the SVG and in
 * `src/components/Logo.tsx`, and changing it means running this again. Anything
 * here that drifts from the SVG is a bug in this file.
 *
 * **Chromium rather than a rasteriser**, and that is availability rather than
 * preference: this repository already installs Playwright's browsers for the
 * end-to-end suite, and no rsvg, ImageMagick or Inkscape is present on a clean
 * macOS or on the CI image. A dependency added to convert an icon four times a
 * year is a dependency the whole team then carries.
 */

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const svg = await readFile(root('public/favicon.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();

for (const { file, size, scale, background } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`
    <style>
      html, body { margin: 0; padding: 0; }
      body {
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        ${background ? `background: ${background};` : ''}
      }
      svg { display: block; width: ${size * scale}px; height: ${size * scale}px; }
    </style>
    ${svg}
  `);

  // `omitBackground` is what makes the transparent ones transparent; on the
  // opaque ones the body colour is painted over it and it does nothing.
  const png = await page.screenshot({ omitBackground: true });
  await writeFile(root(`public/${file}`), png);
  console.log(`public/${file}  ${size}x${size}`);
}

await browser.close();
