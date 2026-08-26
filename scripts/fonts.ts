import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { FONT_FAMILIES, type FontFamilySpec } from '../font-config.ts';

/**
 * Regenerates `src/fonts.css` — the `@font-face` rules that self-host the
 * families named in `font-config.ts`.
 *
 *   yarn fonts
 *
 * The output is committed, because a build that fetched a stylesheet from
 * Google in order to stop depending on Google would be a joke, and because a
 * checkout with no network would otherwise not build.
 *
 * ## What it copies, and what it does not
 *
 * Google's `css2` endpoint is the source of one thing only: the `unicode-range`
 * of each chunk, and the chunk number that goes with it. Those ranges are how a
 * browser knows it needs three 12 KB files to draw a screen of Japanese rather
 * than a 1.5 MB one, and reproducing them by hand is neither possible nor
 * useful — they are a property of how the font was subsetted upstream.
 *
 * The `src` URLs are then rewritten to the matching Fontsource file, which is
 * the same chunk of the same version of the same font: `zen-maru-gothic` ships
 * `v19` and Google serves `v19`, `noto-sans-jp` ships `v56` against Google's
 * `v56`, `inter` ships `v20` against `v20`. The script asserts every rewritten
 * path exists in `node_modules` before writing anything, so a version that
 * stops lining up fails here rather than in a browser.
 *
 * ## Why a browser User-Agent
 *
 * Without one, Google's endpoint serves a `ttf` stylesheet with no
 * `unicode-range` at all — the compatibility answer for clients it does not
 * recognise. That would silently produce a file that works, is a third of the
 * size to look at, and makes every reader download whole megabyte families.
 */

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Face {
  family: string;
  weight: number;
  /** Path as it appears in `src`, resolved by Vite against `node_modules`. */
  source: string;
  unicodeRange: string;
  /** For ordering the output: named subsets first, then chunks descending. */
  chunk: number | null;
}

async function facesFor(spec: FontFamilySpec): Promise<Face[]> {
  const weights = spec.weights.map((weight) => weight.weight).join(';');
  const url = `https://fonts.googleapis.com/css2?family=${spec.googleFamily}:wght@${weights}&display=swap`;

  const response = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
  if (!response.ok) throw new Error(`${spec.family}: Google Fonts answered ${response.status}`);
  const css = await response.text();

  // A `/* subset */` comment introduces a *group* of blocks, not each block, and
  // it is the only place the name of a named subset appears — the URL of one
  // carries no name, while a numbered chunk carries its number in the URL. So
  // comments and blocks are scanned in one pass, with the last comment seen
  // standing as the label for everything after it.
  let label = '';
  const tokens = [...css.matchAll(/\/\*\s*([^*]+?)\s*\*\/|@font-face\s*\{([^}]*)\}/g)];
  const blocks = tokens.reduce<{ label: string; body: string }[]>((acc, token) => {
    if (token[1] !== undefined) label = token[1];
    else acc.push({ label, body: token[2] ?? '' });
    return acc;
  }, []);
  if (blocks.length === 0) throw new Error(`${spec.family}: no @font-face blocks in the response`);

  const faces: Face[] = [];

  for (const { label, body } of blocks) {
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)?.[1]);
    const href = /url\((\S+?)\)/.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!Number.isInteger(weight) || !href || !unicodeRange) {
      throw new Error(`${spec.family}: unreadable @font-face block`);
    }

    // Google labels every numbered Japanese chunk `/* latin */`, so the number
    // in the URL decides, and the comment is consulted only when there is none.
    const numbered = /\.(\d+)\.woff2$/.exec(href);
    const chunk = numbered ? Number(numbered[1]) : null;
    if (chunk === null && !spec.namedSubsets.includes(label)) continue;

    const subset = chunk === null ? label : String(chunk);
    faces.push({
      family: spec.family,
      weight,
      chunk,
      unicodeRange,
      source: `@fontsource/${spec.fontsourcePackage}/files/${spec.fontsourcePackage}-${subset}-${weight}-normal.woff2`,
    });
  }

  return faces;
}

const families = await Promise.all(FONT_FAMILIES.map(facesFor));
const faces = families.flat();

// Verified before writing rather than after, so a mismatched Fontsource version
// leaves the committed CSS untouched instead of replacing it with rules that
// point at nothing.
await Promise.all(
  faces.map(async (face) => {
    const path = root(`node_modules/${face.source}`);
    try {
      await access(path);
    } catch {
      throw new Error(
        `${face.source} is not in node_modules. Google's subsetting of ` +
          `${face.family} no longer matches the Fontsource package — compare ` +
          `their font versions before touching this.`,
      );
    }
  }),
);

const rule = (face: Face) =>
  [
    '@font-face {',
    `  font-family: '${face.family}';`,
    '  font-style: normal;',
    `  font-weight: ${face.weight};`,
    '  font-display: swap;',
    `  src: url('${face.source}') format('woff2');`,
    `  unicode-range: ${face.unicodeRange};`,
    '}',
  ].join('\n');

const header = `/*
 * Generated by \`yarn fonts\` from font-config.ts. Do not edit by hand.
 *
 * These are the same subset files, with the same unicode-ranges, that
 * fonts.googleapis.com serves for this app today — rewritten to same-origin
 * paths so the service worker can cache them and the Content-Security-Policy
 * can stay at 'self'. See font-config.ts for why the set is what it is, and
 * scripts/fonts.ts for how this file is produced.
 *
 * ${faces.length} rules across ${FONT_FAMILIES.length} families.
 */\n\n`;

// Named subsets first, then chunks from most to least common, so a reader
// scrolling from the top meets `latin` and the kana before the long tail.
const sorted = [...faces].sort(
  (a, b) =>
    a.family.localeCompare(b.family) || a.weight - b.weight || (b.chunk ?? -1) - (a.chunk ?? -1),
);

await writeFile(root('src/fonts.css'), header + sorted.map(rule).join('\n\n') + '\n', 'utf8');

console.log(`src/fonts.css: ${faces.length} @font-face rules`);
for (const spec of FONT_FAMILIES) {
  const count = faces.filter((face) => face.family === spec.family).length;
  console.log(`  ${spec.family}: ${count}`);
}
