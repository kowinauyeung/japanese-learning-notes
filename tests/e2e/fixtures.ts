import type { Page } from '@playwright/test';

/**
 * Shared setup for every end-to-end spec.
 *
 * Two things have to be pinned before the page loads, or nothing here is
 * repeatable: the data (seeded into the in-memory adapters that the `e2e` build
 * swaps in) and the clock (the dashboard counts "this week" against `new
 * Date()`, and the heatmap draws a rolling year, so a real clock would change
 * every screenshot overnight).
 */

export interface E2ESeed {
  /** Start already signed in, skipping the login screen. */
  signedIn?: boolean;
  entries?: Record<string, unknown>[];
  /** Entry ids to start marked wrong, so 苦手のみ has something to select. */
  weak?: string[];
  wordSets?: Record<string, unknown>[];
  /** Finished sessions, so 履歴 can be reached without drilling first. */
  sessions?: Record<string, unknown>[];
  profile?: Record<string, unknown>;
}

/** Fixed instant every spec runs at. A Wednesday; its ISO week starts on the 22nd. */
export const NOW = new Date('2026-06-24T10:00:00+09:00');

/**
 * Three entries, chosen to exercise the parts that differ rather than to look
 * like a real notebook: one with kanji plus okurigana (two separate furigana
 * annotations), one whose kanji run stays under a single annotation, and one
 * with no kanji at all. The dates put two in the current ISO week and one
 * earlier in the same year.
 */
export const WORDS: Record<string, unknown>[] = [
  {
    id: 'w-kiriwake',
    headword: '切り分け',
    reading: 'きりわけ',
    definition: '大きな問題を小さな部分に分けること。',
    definitionSub: '分拆問題',
    pos: ['名詞'],
    jlpt: 'N2',
    origin: '和語',
    style: '書き言葉',
    politeness: '普通',
    freq: 3,
    tags: ['仕事'],
    learnedOn: '2026-06-24',
    createdAt: '2026-06-24T01:00:00.000Z',
    updatedAt: '2026-06-24T01:00:00.000Z',
  },
  {
    id: 'w-choukou',
    headword: '兆候',
    reading: 'ちょうこう',
    // The only fixture with an accent. Without one, nothing end to end ever
    // rendered the notation — every spec passed on a feature that was never on.
    pitchAccent: 0,
    definition: '何かが起こる前ぶれ。',
    definitionSub: '徵兆',
    source: 'NHK News',
    pos: ['名詞'],
    jlpt: 'N1',
    origin: '漢語',
    style: '書き言葉',
    politeness: '普通',
    freq: 4,
    tags: ['ニュース'],
    learnedOn: '2026-06-22',
    createdAt: '2026-06-22T01:00:00.000Z',
    updatedAt: '2026-06-22T01:00:00.000Z',
  },
  {
    id: 'w-chotto',
    headword: 'ちょっと',
    reading: 'ちょっと',
    definition: '少しの間、または少しの量。',
    pos: ['副詞'],
    jlpt: 'N5',
    origin: '和語',
    style: '話し言葉',
    politeness: 'くだけた',
    freq: 5,
    tags: ['日常'],
    learnedOn: '2026-01-15',
    createdAt: '2026-01-15T01:00:00.000Z',
    updatedAt: '2026-01-15T01:00:00.000Z',
  },
];

/**
 * Must be called before the first navigation: `addInitScript` runs ahead of the
 * app's own scripts, which is the only point at which the in-memory adapters
 * can still read their seed.
 */
export async function seed(page: Page, data: E2ESeed = {}): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((value) => {
    (window as unknown as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__ = value;
  }, data);
}

/** The common case: signed in, with the three words above already saved. */
export const seedSignedIn = (page: Page) => seed(page, { signedIn: true, entries: WORDS });

/**
 * Start recording whether the full-page 読み込み中… placeholder ever replaces the
 * screen, and return a way to ask afterwards.
 *
 * A flash cannot be caught by looking for it: by the time an assertion runs, the
 * render that caused it has already been undone. It has to be recorded as it
 * happens, which is what the observer is for.
 *
 * The thing it exists to catch: every write ends in its provider's `refresh()`,
 * and every route treats `loading` as "replace the page with 読み込み中…". A
 * refresh that raises that flag therefore takes the whole screen down and puts
 * it back on every single save.
 */
export async function watchForBlanking(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const seen = { it: false };
    (window as unknown as { __blanked: { it: boolean } }).__blanked = seen;
    new MutationObserver(() => {
      if (document.body.textContent?.includes('読み込み中')) seen.it = true;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __blanked: { it: boolean } }).__blanked.it);
}

/**
 * One 単語集 over two of the three words.
 *
 * Seeded rather than built through `/wordsets` in every spec that needs one:
 * the specs about what a set *does* should not each pay for the four clicks
 * that make it. `wordsets.spec.ts` covers those clicks once.
 */
export const WORD_SETS: Record<string, unknown>[] = [
  { id: 'set-work', name: '仕事セット', entryIds: ['w-kiriwake', 'w-choukou'] },
];

/**
 * One 単語集 holding all three words.
 *
 * Deleting one of them leaves a set whose stored `entryIds` is longer than the
 * rows it renders — the state in which a visible row index and a stored index
 * stop agreeing, and the only shape that can see it.
 */
export const FULL_SET: Record<string, unknown>[] = [
  {
    id: 'set-all',
    name: '全部セット',
    entryIds: ['w-kiriwake', 'w-choukou', 'w-chotto'],
  },
];

/**
 * Two 単語集 that both claim 兆候.
 *
 * A word belongs to as many sets as it is put in — membership is a list on each
 * set, and nothing on the entry records which of them claimed it. That is what
 * makes deleting the word a question about several documents at once.
 */
export const OVERLAPPING_SETS: Record<string, unknown>[] = [
  { id: 'set-work', name: '仕事セット', entryIds: ['w-kiriwake', 'w-choukou'] },
  { id: 'set-news', name: 'ニュースセット', entryIds: ['w-choukou'] },
];

/**
 * `count` finished sessions, newest last, an hour apart.
 *
 * Built rather than written out because the only thing being tested with more
 * than a couple of them is the cursor, and a page boundary needs more rows than
 * anybody wants to read in a fixture.
 */
export function makeSessions(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e2e-session-${index + 1}`,
    mode: index % 2 === 0 ? 'flashcard' : 'dictation',
    filterLabel: `記録 ${index + 1}`,
    total: 3,
    correct: index % 3,
    missed: [],
    startedAt: new Date(Date.UTC(2026, 5, 1, index)).toISOString(),
    finishedAt: new Date(Date.UTC(2026, 5, 1, index, 5)).toISOString(),
  }));
}
