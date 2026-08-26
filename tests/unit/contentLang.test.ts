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
 *
 * **The face is required on the element itself, not inherited.** Several of
 * these sit inside a `.prose-cjk` parent and would render correctly without a
 * class of their own. Requiring it anyway is what lets this be a local check
 * rather than one that has to model inheritance — and a redundant
 * `font-family: var(--font-cjk)` costs nothing, since it resolves to what the
 * element was already inheriting.
 */
describe('every language tag has a face to apply', () => {
  const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

  /**
   * The two that put `lang` on a wrapper whose face is the caller's. Every call
   * site passes `font-display`, so these carry Zen Maru Gothic by inheritance —
   * asserted where it is decided, in `Ruby.test.tsx`, rather than here.
   */
  const CALLER_SUPPLIES_THE_FACE = ['components/Ruby.tsx', 'components/PitchAccent.tsx'];

  /** Block comments hold prose about `lang="…"`, which is not markup. */
  const stripComments = (source: string) => source.replaceAll(/\/\*[\s\S]*?\*\//g, '');

  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx') && !CALLER_SUPPLIES_THE_FACE.includes(name))
    .map((name) => ({ name, source: stripComments(readFileSync(`${srcDir}/${name}`, 'utf8')) }))
    .filter((file) => file.source.includes('lang='));

  /**
   * `(?:[^>]|=>)` rather than `[^>]`, because an attribute list can contain an
   * arrow function — the dictation answer field's does — and a bare `[^>]*`
   * gives up at the `>` inside `=>`, skipping the element in silence. The count
   * assertion below is what proves this keeps working.
   */
  const elementsIn = (source: string) => [
    ...source.matchAll(/<\w+\s((?:[^>]|=>)*?lang=(?:\{[^}]*\}|"[^"]*")(?:[^>]|=>)*?)\/?>/g),
  ];

  const tagged = files.flatMap((file) =>
    elementsIn(file.source).map((match) => ({
      name: file.name,
      attributes: match[1] ?? '',
      line: file.source.slice(0, match.index).split('\n').length,
    })),
  );

  // Without this the loop below passes by matching nothing — which is also what
  // a regular expression that stopped working would look like.
  it('finds the tagged elements to check', () => {
    expect(tagged.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [file.name, file] as const))(
    'every lang= in %s is on an element this can read',
    (_name, file) => {
      // The half that makes the assertions below mean anything. This reads JSX
      // with a regular expression, which cannot be right for every form JSX
      // takes — and the way it fails is to match nothing and skip the element
      // in silence, which reads as coverage. Counting both ways turns a form it
      // cannot parse into a red test instead of a gap.
      expect(elementsIn(file.source).length).toBe([...file.source.matchAll(/\blang=/g)].length);
    },
  );

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
