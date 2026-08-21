import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

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

/**
 * The theme's light background, copied from `--c-bg` in `src/index.css` and
 * from the `data-light` colour on the theme-color tag in `index.html`.
 *
 * Duplicated rather than imported because those are CSS and HTML, and because
 * an icon may not follow the reader's theme in any case: it is baked into a PNG
 * at build time and then sits on a home screen that has its own idea of light
 * and dark. The mark is the brand's, so it renders on the brand's surface.
 */
const BACKGROUND = '#f7fbf9';

interface IconSpec {
  file: string;
  size: number;
  /** How much of the canvas edge to edge the 48-unit mark is drawn across. */
  scale: number;
  /** An opaque surface behind the mark, or `null` to keep the PNG transparent. */
  background: string | null;
}

const icons: readonly IconSpec[] = [
  // The two sizes Chromium requires before it will treat the manifest as
  // installable at all. Transparent, because these are composited onto surfaces
  // this file cannot see — a Windows taskbar, a ChromeOS shelf, an install
  // dialog in either theme — and the book green was already chosen dark enough
  // to hold its shape against a dark one.
  { file: 'icon-192.png', size: 192, scale: 0.9, background: null },
  { file: 'icon-512.png', size: 512, scale: 0.9, background: null },

  // Maskable, which is a different picture and not a resize of the one above.
  //
  // Android crops this to whatever shape the launcher uses — circle, squircle,
  // teardrop — and only the inner 80% circle is guaranteed to survive.
  //
  // 0.8 is measured against the shape the mark paints, not against its bounding
  // box: the box corners are empty — the leaves reach the top centre and the
  // book's outer edges sit well below them — and sizing to the box would inset
  // the icon by a fifth for margin nothing occupies. Measured on the generated
  // PNG, the furthest painted pixel sits 191px from the centre, inside the
  // 205px the safe circle allows.
  //
  // The surface is opaque, and that is not decoration: a transparent maskable
  // icon is cropped to a shape with nothing behind it, which is how a logo ends
  // up sitting on a black lozenge.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8, background: BACKGROUND },

  // iOS, which reads none of the above. It ignores an SVG favicon, ignores
  // `purpose`, applies its own rounded-rectangle mask, and composites any
  // transparency onto black — so this one is opaque too. Its mask takes the
  // corners and nothing else, and the mark reaches neither, so it is drawn
  // larger than the maskable one rather than to the same inset.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.85, background: BACKGROUND },
];

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
