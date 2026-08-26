import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { entrySummary } from '@/lib/contentLang';
import { makeEntry } from '../fixtures/entry';

/**
 * The one line five screens show under a headword, and which language it is in.
 *
 * The defect this exists for: `senses[0].description || definition` reads like
 * one value and is two, in two different languages. `src/domain/entry.ts` calls
 * `description` a "Japanese explanation of this sense", and refuses to say
 * anything at all about `definition` — "write it in Japanese, in your own
 * language, or both". Tagging the whole expression `ja` because the common case
 * is Japanese takes the regional-forms defect that motivated #81 and points it
 * at the one field an entry is required to have.
 *
 * Here rather than in five component tests because it is a function of its
 * inputs, and `EntryRow`, `EntryCard`, `TodayWord`, `DictationSession` and
 * `FlashcardSession` all have to agree about it.
 */

describe('entrySummary', () => {
  it('marks a sense description Japanese, which is what the schema calls it', () => {
    const entry = makeEntry({
      definition: 'unused',
      senses: [
        {
          label: '',
          description: '物事が起こる前のしるし。',
          example: '',
          exampleGloss: '',
          translation: '',
          usage: '',
        },
      ],
    });

    expect(entrySummary(entry)).toEqual({ text: '物事が起こる前のしるし。', lang: 'ja' });
  });

  it("leaves the definition fallback unmarked, since it may be in the reader's language", () => {
    // A note with no senses recorded, whose required field is Cantonese. Under
    // a `ja` tag this renders in Japanese forms — the mirror of the bug the
    // change is fixing, on the field hardest to avoid writing.
    const entry = makeEntry({ definition: '花開嘅跡象', senses: [] });

    expect(entrySummary(entry)).toEqual({ text: '花開嘅跡象' });
  });

  it('falls through an empty description rather than showing a blank line', () => {
    // The call sites used `||`, not `??`. A sense recorded with a label and no
    // description would otherwise leave the row with nothing under the
    // headword, which reads as a note with no meaning rather than as one whose
    // first sense is unfinished.
    const entry = makeEntry({
      definition: '何かが起こる前ぶれ。',
      senses: [
        {
          label: '兆候',
          description: '',
          example: '',
          exampleGloss: '',
          translation: '',
          usage: '',
        },
      ],
    });

    expect(entrySummary(entry)).toEqual({ text: '何かが起こる前ぶれ。' });
  });
});

/**
 * The guard for the site nobody wrote a test for.
 *
 * `senses[0].description || definition` was inlined at six call sites, and the
 * sixth — the missed-word list in `SessionSummary` — survived two rounds of
 * review. It survived because it is the one without `prose-cjk`, so a search
 * for the summary pattern by its styling missed it, and because no component
 * test existed for that screen: a per-component assertion cannot fail for a
 * screen nobody thought to cover.
 *
 * So the assertion is about the codebase rather than about one render. It is
 * the cheapest layer that can see this defect, because the defect is *a call
 * site that bypassed the helper* — which is a fact about the source.
 */
describe('every screen goes through entrySummary', () => {
  const srcDir = fileURLToPath(new URL('../../src', import.meta.url));
  const components = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((name) =>
    name.endsWith('.tsx'),
  );

  // Without this the loop below passes by reading nothing at all.
  it('has components to read', () => {
    expect(components.length).toBeGreaterThan(20);
  });

  it.each(components)('%s does not reach past it into senses[0]', (name) => {
    const source = readFileSync(`${srcDir}/${name}`, 'utf8');
    expect(
      source,
      `${name} reads senses[0] directly. The one-line summary under a headword is ` +
        '`entrySummary(entry)`: its `text` is the sense description or the definition, ' +
        'and its `lang` is `ja` for the first and absent for the second, because the ' +
        'schema says what language one is in and refuses to say for the other.',
    ).not.toContain('senses[0]');
  });
});

/**
 * A language tag with no face to apply it to.
 *
 * The `:lang()` rules in `src/index.css` redefine `--font-cjk`, and only
 * `.cjk-face` and `.prose-cjk` read that variable. An element that carries a
 * perfectly correct `lang="ja"` and neither class inherits `--font-sans`
 * instead — `Inter`, which has no CJK at all — so the text falls through to
 * whatever the platform happens to have, and the tag does nothing at all.
 *
 * That is not hypothetical: seven elements were in exactly that state, and the
 * first of them was found by review rather than by anything here. It is
 * invisible in every other layer — the markup is right, the CSS is right, and
 * the text is perfectly legible in the wrong face.
 */
describe('every language tag has a face to apply', () => {
  const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

  /**
   * The two that put `lang` on a wrapper whose face is the caller's. Every call
   * site passes `font-display`, so these carry Zen Maru Gothic by inheritance —
   * asserted where it is decided, in `Ruby.test.tsx`, rather than here.
   */
  const CALLER_SUPPLIES_THE_FACE = ['components/Ruby.tsx', 'components/PitchAccent.tsx'];

  const tagged = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx') && !CALLER_SUPPLIES_THE_FACE.includes(name))
    .flatMap((name) => {
      const source = readFileSync(`${srcDir}/${name}`, 'utf8');
      return [...source.matchAll(/<\w+\s([^>]*lang=\{[^}]*\}[^>]*)>/g)].map((match) => ({
        name,
        attributes: match[1] ?? '',
        line: source.slice(0, match.index).split('\n').length,
      }));
    });

  // Without this the loop below passes by matching nothing — which is also what
  // a regular expression that stopped working would look like.
  it('finds the tagged elements to check', () => {
    expect(tagged.length).toBeGreaterThan(10);
  });

  it.each(tagged.map((el) => [`${el.name}:${el.line}`, el] as const))(
    '%s reads --font-cjk, without which its lang decides nothing',
    (_where, element) => {
      // A class assertion, and a load-bearing one rather than a styling
      // preference: these two classes are the only things in the stylesheet
      // that read `--font-cjk`, so without one the `:lang()` override has
      // nothing to override and the element is drawn by the platform.
      expect(element.attributes).toMatch(/\b(cjk-face|prose-cjk|font-display)\b/);
    },
  );
});
