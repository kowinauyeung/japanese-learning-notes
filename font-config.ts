/**
 * Which font files this app ships, and which of them the service worker
 * precaches — as a value, for the same reason `pwa-config.ts` is one: the
 * interesting part is a set of decisions, and a decision that only exists
 * inside a build step cannot be read back or asserted on.
 *
 * `tests/unit/fontConfig.test.ts` reads it, `scripts/fonts.ts` generates
 * `src/fonts.css` from it, and `vite.config.ts` uses `isCoreFontFile` to sort
 * the emitted `.woff2` files into two directories the worker treats
 * differently.
 *
 * ## Why the files are chunked rather than whole
 *
 * A CJK family is not one file. `Zen Maru Gothic` covers thousands of glyphs,
 * and the whole Japanese subset is about 1.5 MB *per weight*. Google never
 * serves that: its stylesheet splits the subset into 118 numbered pieces with a
 * `unicode-range` each, ordered by how common the characters are, and a browser
 * downloads only the pieces the text on screen actually needs.
 *
 * Self-hosting the single combined file would therefore not be "the same fonts,
 * served from here" — it would be a first paint that pulls megabytes where
 * today it pulls tens of kilobytes. So this ships the same pieces Google does.
 * Fontsource packages them under the same numbering (`…-119-500-normal.woff2`
 * is Google's `….119.woff2`), which is what makes `scripts/fonts.ts` a URL
 * rewrite rather than a re-subsetting job.
 *
 * ## Why some pieces are precached and the rest are not
 *
 * Precaching every piece of every weight is 6.8 MB, which is not a font
 * strategy, it is a download. Precaching none of them means a reader who
 * installs the app and first opens it on a train sees their vocabulary in
 * whatever face the phone picked — which #81 is explicit about being a change
 * to the subject of the application, not a cosmetic one.
 *
 * So each weight names the frequency rank from which its pieces are precached,
 * and everything below that rank is cached at runtime on first sight. The
 * ranks below are not uniform, because the weights are not used for the same
 * thing — see each entry.
 */

/** Where `vite.config.ts` emits a font file the worker precaches. */
export const CORE_FONT_DIR = 'assets/fonts/core';

/** Where it emits one the worker caches only once something has asked for it. */
export const RUNTIME_FONT_DIR = 'assets/fonts/ext';

export interface FontWeightSpec {
  weight: number;
  /**
   * The lowest Google chunk number precached for this weight. Higher numbers
   * hold more frequent characters — 119 is kana and full-width punctuation, 118
   * the most common kanji plus ASCII — so a lower bound here means more of the
   * language is guaranteed offline, at a proportional cost in bytes.
   */
  coreFrom: number;
  /** Why that bound and not another. Read by nothing; the point is the record. */
  because: string;
}

export interface FontFamilySpec {
  /** The `font-family` name, as written in `src/index.css`. */
  family: string;
  /** The Fontsource package, which is also the prefix of every file it ships. */
  fontsourcePackage: string;
  /** The family as Google Fonts' `css2` endpoint names it. */
  googleFamily: string;
  weights: FontWeightSpec[];
  /**
   * Named (non-numbered) subsets to ship. Always precached: they are small, and
   * they carry the Latin the interface is largely made of.
   *
   * `latin-ext`, `cyrillic`, `greek` and `vietnamese` are deliberately absent.
   * The interface locales are `en`, `ja`, `zh-Hant`, `ko` and `es`, and every
   * accented character Spanish uses lives in `latin`'s U+0000–00FF.
   */
  namedSubsets: string[];
}

export const FONT_FAMILIES: FontFamilySpec[] = [
  {
    family: 'Zen Maru Gothic',
    fontsourcePackage: 'zen-maru-gothic',
    googleFamily: 'Zen+Maru+Gothic',
    namedSubsets: ['latin'],
    weights: [
      {
        weight: 500,
        coreFrom: 110,
        because:
          'This weight renders furigana (`rt`), the reading line under a ' +
          'headword, and the pitch-accent kana — all kana, which chunk 119 ' +
          'alone covers. The only kanji it ever draws is the initial in the ' +
          'account avatar, so buying its whole range offline would be paying ' +
          'megabytes for one character.',
      },
      {
        weight: 700,
        coreFrom: 70,
        because:
          'This is the headword. It is the thing the reader opened the app to ' +
          'look at, and the one place where falling back to the platform face ' +
          'changes the subject matter rather than the styling — so it gets the ' +
          'most generous bound of the three. 70 covers a sample of everyday ' +
          'and JLPT vocabulary (謙譲語, 漢字, 勉強, 品詞) end to end.',
      },
    ],
  },
  {
    family: 'Noto Sans JP',
    fontsourcePackage: 'noto-sans-jp',
    googleFamily: 'Noto+Sans+JP',
    namedSubsets: ['latin'],
    weights: [
      {
        weight: 400,
        coreFrom: 90,
        because:
          'Prose: definitions, example sentences, word-set descriptions. Only ' +
          'one weight, because `.prose-cjk` is never combined with a weight ' +
          'utility anywhere in `src`. A rarer kanji in a definition that falls ' +
          'back for one glyph while offline is a smaller loss than the same ' +
          'thing happening to a headword, which is why this bound is higher ' +
          'than 700 above.',
      },
    ],
  },
  {
    family: 'Inter',
    fontsourcePackage: 'inter',
    googleFamily: 'Inter',
    namedSubsets: ['latin'],
    // No numbered chunks: Inter is a Latin family, so `latin` is the whole of
    // what this app uses. All four weights are in `src` — 400 on `body`, 500 as
    // `font-medium`, 600 as `font-semibold`, 700 as `font-bold`.
    weights: [
      { weight: 400, coreFrom: 0, because: 'Body text.' },
      { weight: 500, coreFrom: 0, because: '`font-medium`.' },
      { weight: 600, coreFrom: 0, because: '`font-semibold`.' },
      { weight: 700, coreFrom: 0, because: '`font-bold`.' },
    ],
  },
];

/**
 * The three families are the whole list on purpose.
 *
 * `Noto Sans TC` used to be here, and its removal is the point of the change
 * rather than a saving made along the way: it was `--font-cjk`, so it drew the
 * Japanese prose this app is *about*, in Traditional Chinese character forms.
 * Compared glyph by glyph against `Noto Sans JP` — same family, same weights,
 * so the only variable is the regional form — 11 of 13 sampled characters
 * differ, and several differ by stroke count: 草, 花 and 英 carry the four-stroke
 * 艹 rather than the Japanese three, 骨 flips its upper-right box, 令 takes the
 * 卩 foot instead of マ. A reader copying strokes off the screen was being shown
 * the wrong ones.
 *
 * Traditional Chinese is still an interface locale, and it still needs a face:
 * it now gets the platform's, named in the `:lang(zh-Hant)` block in
 * `src/index.css`. Every platform a Traditional Chinese reader is on ships one,
 * and the interface is a few dozen labels — not worth 3 MB and not worth the
 * risk of it reaching the vocabulary again.
 */
export const REMOVED_FAMILIES = ['Noto Sans TC'] as const;

/**
 * Vite's `assetsInlineLimit`, as a function of the file path.
 *
 * **Never inline a font, whatever its size.** The default inlines any asset
 * under 4 KiB as a `data:` URI, and 12 of the `Zen Maru Gothic` chunks are
 * under it — the rare end of Google's ordering, where a chunk holds a handful
 * of glyphs. Inlined, they are emitted into neither directory: they land inside
 * `index.css`, which is precached, so twelve files this file had assigned to
 * the runtime half ride into every reader's precache anyway, base64 and a third
 * larger for the trip.
 *
 * It reports nothing. `isCoreFontFile` is simply never asked about a file that
 * was never emitted, and `dist` comes out with 351 woff2 against 363 rules.
 *
 * `undefined` for everything else leaves Vite's own rule in place for the small
 * SVGs and PNGs it was written for.
 */
export function assetsInlineLimit(filePath: string): false | undefined {
  return filePath.endsWith('.woff2') ? false : undefined;
}

interface ParsedFontFile {
  fontsourcePackage: string;
  /** The numbered chunk, or `null` for a named subset such as `latin`. */
  chunk: number | null;
  weight: number;
}

/**
 * Reads a Fontsource file name back into the three things that decide where it
 * goes. Returns `null` for anything that is not one, so a caller can pass every
 * asset in a build without filtering first.
 *
 * Written by matching the packages this app declares rather than by a general
 * pattern, because `zen-maru-gothic-latin-ext-500-normal.woff2` is ambiguous to
 * a pattern — the package name and the subset name both contain hyphens, and a
 * greedy split reads the package as `zen-maru-gothic-latin`.
 */
export function parseFontFile(fileName: string): ParsedFontFile | null {
  if (!fileName.endsWith('-normal.woff2')) return null;

  for (const { fontsourcePackage } of FONT_FAMILIES) {
    const prefix = `${fontsourcePackage}-`;
    if (!fileName.startsWith(prefix)) continue;

    const middle = fileName.slice(prefix.length, -'-normal.woff2'.length);
    const cut = middle.lastIndexOf('-');
    if (cut < 0) continue;

    const weight = Number(middle.slice(cut + 1));
    if (!Number.isInteger(weight)) continue;

    const subset = middle.slice(0, cut);
    const chunk = /^\d+$/.test(subset) ? Number(subset) : null;
    return { fontsourcePackage, chunk, weight };
  }

  return null;
}

/**
 * Whether the service worker precaches this file, rather than waiting for
 * something to ask for it.
 *
 * A file this app does not ship at all answers `false`, which is the safe way
 * round: an unrecognised font in a build gets runtime caching, not a place in
 * every reader's precache.
 */
export function isCoreFontFile(fileName: string): boolean {
  const parsed = parseFontFile(fileName);
  if (!parsed) return false;

  const family = FONT_FAMILIES.find(
    (candidate) => candidate.fontsourcePackage === parsed.fontsourcePackage,
  );
  const weight = family?.weights.find((candidate) => candidate.weight === parsed.weight);
  if (!weight) return false;

  // A named subset — `latin` — has no frequency rank to compare against, and is
  // always precached.
  return parsed.chunk === null || parsed.chunk >= weight.coreFrom;
}
