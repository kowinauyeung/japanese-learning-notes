import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SessionSummary } from '@/components/practice/SessionSummary';
import { VocabDialogProvider } from '@/lib/vocabDialog';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

/**
 * The screen the language markup was missed on, twice.
 *
 * The missed-word list renders the same one-line summary the dashboard and the
 * vocabulary grid do, but it is the only one of the six without `prose-cjk` —
 * so a search for that pattern by its styling did not find it, and no test
 * covered this screen, so nothing failed. It went through two rounds of review
 * carrying `senses[0].description || definition` inline.
 *
 * Both assertions below look structural and neither is. Together they are the
 * whole mechanism: `lang` is what the `:lang()` rules in `src/index.css` select
 * on, and `cjk-face` is what makes the element read `--font-cjk` at all.
 * Missing either, this row is drawn by whatever face the platform picked — a
 * different one from the headword sitting beside it, and offline a different
 * one again.
 */

const missed = makeEntry({
  id: 'e1',
  headword: '兆候',
  reading: 'ちょうこう',
  definition: '花開嘅跡象',
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

const renderSummary = (entries = [missed]) =>
  render(
    <MemoryRouter>
      <VocabDialogProvider>
        <SessionSummary
          total={3}
          correct={2}
          missed={entries}
          saving={false}
          saveError={null}
          onRestart={() => {}}
          onRetryMissed={() => {}}
        />
      </VocabDialogProvider>
    </MemoryRouter>,
  );

describe('SessionSummary — the missed-word list', () => {
  it('draws a sense description with the Japanese face rather than the platform default', () => {
    renderSummary();
    const summary = screen.getByText('物事が起こる前のしるし。');

    // `lang` is the only thing the `:lang()` rules in `src/index.css` select
    // on. Without it this line is drawn in the interface locale's forms — for a
    // Traditional Chinese reader, Japanese vocabulary in Chinese strokes.
    expect(summary.getAttribute('lang')).toBe('ja');
    // And `cjk-face` is the only thing that makes the element read
    // `--font-cjk` at all. Without it the tag above selects nothing: the span
    // inherits `Inter`, which has no CJK, and every character falls through to
    // whatever the platform picked — a different face from the headword two
    // columns to its left, on the same row.
    expect(summary.className).toContain('cjk-face');
  });

  it('still asks for the CJK face when it falls back to the definition, but claims no language', () => {
    renderSummary([makeEntry({ id: 'e2', definition: '花開嘅跡象', senses: [] })]);
    const summary = screen.getByText('花開嘅跡象');

    // The schema refuses to tie `definition` to a language, so a tag here would
    // draw this reader's own Cantonese in Japanese forms — 花 with the
    // three-stroke 艹 rather than the four they wrote it with.
    expect(summary.getAttribute('lang')).toBeNull();
    // The face is still required. Untagged means "follow the document", not
    // "follow nothing": without this class the element reads `--font-sans` and
    // the document's language decides nothing at all.
    expect(summary.className).toContain('cjk-face');
  });
});
