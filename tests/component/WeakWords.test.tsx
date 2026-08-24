import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WeakWords } from '@/components/history/WeakWords';
import { EMPTY_PRACTICE_FILTERS } from '@/lib/practice';
import type { PracticeFilters } from '@/lib/practice';
import { VocabDialogProvider } from '@/lib/vocabDialog';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

const WORDS = [makeEntry({ id: 'w1', headword: '切り分け' })];

const setup = (
  words = WORDS,
  filters: PracticeFilters = { ...EMPTY_PRACTICE_FILTERS, weakOnly: true },
) =>
  render(
    <MemoryRouter>
      <VocabDialogProvider>
        <WeakWords words={words} filters={filters} />
      </VocabDialogProvider>
    </MemoryRouter>,
  );

/**
 * 復習's whole job is the link it produces: the scope on screen has to be the
 * scope the drill opens with, and `start=1` is what makes it a review rather
 * than a setup screen. Both live in an href, so this is where they are visible.
 */
describe('WeakWords — the 復習 links', () => {
  it('carries the scope and asks the drill to begin', () => {
    setup();

    expect(screen.getByRole('link', { name: 'フラッシュカードで復習' })).toHaveAttribute(
      'href',
      '/practice/flashcards?weak=1&start=1',
    );
    expect(screen.getByRole('link', { name: '書き取り練習で復習' })).toHaveAttribute(
      'href',
      '/practice/dictation?weak=1&start=1',
    );
  });

  /**
   * The panel is the list *and* the buttons under it, so a scope narrower than
   * 苦手のみ has to reach the drill too — otherwise the buttons would drill
   * something other than the words printed above them.
   */
  it('carries a narrower scope than 苦手のみ when it is given one', () => {
    setup(WORDS, { ...EMPTY_PRACTICE_FILTERS, weakOnly: true, jlpt: ['N2'] });

    expect(screen.getByRole('link', { name: 'フラッシュカードで復習' })).toHaveAttribute(
      'href',
      '/practice/flashcards?jlpt=N2&weak=1&start=1',
    );
  });

  /** Nothing to review is not an empty panel, it is no panel. */
  it('renders nothing at all when no word is weak', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });
});
