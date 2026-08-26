import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { EntryBody } from '@/components/detail/EntryBody';
import type { TranslationLanguage, UserProfile } from '@/domain/user';
import { I18nProvider } from '@/i18n/I18nProvider';
import { UserSettingsContext } from '@/lib/userSettingsContext';
import { makeEntry } from '../fixtures/entry';

/**
 * The defect this exists for: a note is written in two languages and Unicode
 * gives them the same code points.
 *
 * `src/domain/entry.ts` says which is which — `definitionSub` holds "the
 * migrated notes' Cantonese rendering", `translation` on a sense or an example
 * is "the learner's translation language", and the Japanese explanations beside
 * them are Japanese. Nothing in the DOM said so, so whichever face `--font-cjk`
 * named drew both: with `Noto Sans TC` there, this app about Japanese rendered
 * its Japanese in Traditional Chinese character forms — 花 and 草 with the
 * four-stroke 艹, 骨 with its upper-right box mirrored, 令 on the 卩 foot. A
 * learner copying strokes off the screen was copying the wrong ones.
 *
 * These assertions look structural and are not. `lang` is the only thing the
 * `:lang()` rules in `src/index.css` select on, so an attribute that goes
 * missing here silently restores the defect — and it restores it *invisibly*,
 * because both faces render, both are legible, and only the strokes differ.
 * What the shapes actually come out as is a rendering fact and belongs to the
 * screenshots in `tests/e2e/visual.spec.ts`.
 */

const TRANSLATION: TranslationLanguage = 'yue-Hant';

function renderBody(node: ReactNode, translationLanguage: TranslationLanguage = TRANSLATION) {
  const profile = { translationLanguage } as UserProfile;
  return render(
    <I18nProvider locale="zh-Hant">
      <UserSettingsContext.Provider
        value={{
          profile,
          loading: false,
          saving: false,
          error: null,
          preview: () => {},
          save: async () => {},
        }}
      >
        {node}
      </UserSettingsContext.Provider>
    </I18nProvider>,
  );
}

const entry = makeEntry({
  definition: '何かが起こる前ぶれ。',
  definitionSub: '徵兆',
  senses: [
    {
      label: '兆候（ちょうこう）',
      description: '物事が起こる前のしるし。',
      example: '景気回復の兆候が見える。',
      exampleGloss: '',
      translation: '見到經濟復甦嘅跡象。',
      usage: '',
    },
  ],
  examples: [{ ja: '花が咲く兆候。', translation: '花開嘅跡象。' }],
});

describe('EntryBody — which language each field is in', () => {
  it('marks a sense description Japanese, so a Chinese interface does not redraw it', () => {
    renderBody(<EntryBody entry={entry} />);

    // The interface locale is `zh-Hant`, which is exactly the case that was
    // wrong: `documentElement.lang` becomes `zh-Hant`, every unmarked field
    // inherits it, and this sentence is then drawn with 四-stroke 艹 and a
    // mirrored 骨 — the strokes a learner copying off the screen would take.
    expect(screen.getByText('物事が起こる前のしるし。').getAttribute('lang')).toBe('ja');
    // The same for the example sentence, which the schema also calls Japanese.
    expect(screen.getByText('景気回復の兆候が見える。').getAttribute('lang')).toBe('ja');
  });

  it('leaves `definition` unmarked, since the schema declines to say what language it is', () => {
    renderBody(<EntryBody entry={entry} />);

    // The schema calls this "the one piece of content every entry must have"
    // and explicitly refuses to tie it to a language — "write it in Japanese,
    // in your own language, or both". A tag here points the very defect this
    // change fixes the other way: a required field written in Cantonese, drawn
    // in Japanese character forms on the screen its author reads every day.
    expect(screen.getByText('何かが起こる前ぶれ。').getAttribute('lang')).toBeNull();
  });

  it.each([
    ['徵兆', 'the Cantonese gloss beside the definition'],
    ['見到經濟復甦嘅跡象。', "a sense's translation"],
    ['花開嘅跡象。', "an example's translation"],
  ])("marks %s with the reader's translation language, being %s", (text) => {
    renderBody(<EntryBody entry={entry} />);

    // The half a blanket `lang="ja"` on the whole note would break. These are
    // the reader's own Cantonese: without their own tag they inherit `ja` and
    // are drawn with Japanese regional forms, and the characters Japanese does
    // not use — 嘅, 咗, 喺 — fall through to the platform one glyph at a time,
    // so a single line comes out in two faces.
    expect(screen.getByText(text).closest('[lang]')?.getAttribute('lang')).toBe(TRANSLATION);
  });

  it('leaves a translation unmarked when there is no profile to read it from', () => {
    render(
      <I18nProvider locale="zh-Hant">
        <EntryBody entry={entry} />
      </I18nProvider>,
    );

    // A published entry renders outside the settings provider, and its
    // translation is in *its author's* language, which the reader's profile
    // does not know. Guessing `ja` here would mislabel every public note in the
    // catalogue; inheriting the document's language is the honest answer.
    expect(screen.getByText('徵兆').getAttribute('lang')).toBeNull();
    // The Japanese half does not depend on the profile, so a missing provider
    // must not quietly take the tag off it too.
    expect(screen.getByText('物事が起こる前のしるし。').getAttribute('lang')).toBe('ja');
  });
});
