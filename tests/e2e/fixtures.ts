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
    definition: '何かが起こる前ぶれ。',
    definitionSub: '徵兆',
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
