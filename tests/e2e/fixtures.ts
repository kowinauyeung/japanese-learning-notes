import type { Page } from '@playwright/test';
import type { E2ESeed, SeedEntry, SeedSession, SeedWordSet } from '@/lib/e2eSeed';

/**
 * Shared setup for every end-to-end spec.
 *
 * Two things have to be pinned before the page loads, or nothing here is
 * repeatable: the data (seeded into the in-memory adapters that the `e2e` build
 * swaps in) and the clock (the dashboard counts "this week" against `new
 * Date()`, and the heatmap draws a rolling year, so a real clock would change
 * every screenshot overnight).
 */

/** Fixed instant every spec runs at. A Wednesday; its ISO week starts on the 22nd. */
export const NOW = new Date('2026-06-24T10:00:00+09:00');

/**
 * Three entries, chosen to exercise the parts that differ rather than to look
 * like a real notebook: one with kanji plus okurigana (two separate furigana
 * annotations), one whose kanji run stays under a single annotation, and one
 * with no kanji at all. The dates put two in the current ISO week and one
 * earlier in the same year.
 */
export const WORDS = [
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
] satisfies SeedEntry[];

/**
 * One word with every optional part of a note filled in.
 *
 * **Deliberately not in `WORDS`**, for the same reason `OVERSIZE_WORDS` is not:
 * every committed screenshot is taken against that array.
 *
 * `WORDS` records nothing but a definition, so a summary of a note and the whole
 * note render identically against it — which is how the dialog spent its life
 * showing one sense and one example with no test able to see the difference.
 * This is the shape that tells them apart: two senses, two examples, the
 * sentence the word was met in, the usage notes and a related word.
 */
export const DETAILED_WORD = {
  id: 'w-choukou',
  headword: '兆候',
  reading: 'ちょうこう',
  pitchAccent: 0,
  definition: '何かが起こる前ぶれ。',
  definitionSub: '徵兆',
  citationForm: '兆候',
  source: 'NHK News',
  pos: ['名詞'],
  jlpt: 'N1',
  origin: '漢語',
  style: '書き言葉',
  politeness: '普通',
  freq: 4,
  posInfo: { title: '名詞情報', rows: [{ label: 'する動詞化', value: 'しない' }] },
  context: {
    original: '景気回復の兆候が見えてきた。',
    ja: '景気がよくなりはじめた様子が見える。',
    translation: '經濟復甦的跡象開始浮現。',
  },
  senses: [
    {
      label: '前触れ',
      description: '何かが起こる前に現れるしるし。',
      example: '地震の兆候をとらえる。',
      exampleGloss: '捕捉地震的前兆',
      translation: '徵兆',
      usage: 'ニュースや報告書で',
    },
    {
      label: '症状',
      description: '病気のはじまりを示すしるし。',
      example: '回復の兆候が見られる。',
      exampleGloss: '',
      translation: '跡象',
      usage: '',
    },
  ],
  examples: [
    { ja: '不況の兆候が現れる。', translation: '出現不景氣的徵兆。' },
    { ja: '春の兆候を感じる。', translation: '感受到春天的氣息。' },
  ],
  usage: {
    when: '悪いことの前触れに使うことが多い。',
    translation: 'sign, indication',
    caution: '「症状」とは違い、病気そのものを指さない。',
  },
  related: [{ headword: '前兆', note: 'ほぼ同義。より文語的。' }],
  tags: ['ニュース'],
  learnedOn: '2026-06-22',
  createdAt: '2026-06-22T01:00:00.000Z',
  updatedAt: '2026-06-22T01:00:00.000Z',
} satisfies SeedEntry;

/**
 * A note whose fields are long enough to break the layout, in the two ways that
 * actually did.
 *
 * **Deliberately not in `WORDS`.** Every committed screenshot is taken against
 * that array, so adding a fourth entry there would put a red diff on baselines
 * that have nothing to do with this — and the only way to clear it would be to
 * regenerate images to make a failing test pass, which is the one thing the
 * testing rules refuse outright.
 *
 * Both headwords are drawn from what a real notebook produced, not invented:
 *
 *  - An unbroken run of Latin letters. This is the one that escapes its
 *    container, because CJK breaks between almost any two characters and Latin
 *    offers no break opportunity at all — which is why a notebook written in
 *    Japanese hid the defect until somebody typed `wwww…`.
 *  - A 60-character Japanese headword, which wraps but does not overflow. It
 *    grows the card instead: the tallest card in a row sets the height of every
 *    card beside it, so one long word leaves a grid of otherwise short entries
 *    with a band of empty space through it.
 */
export const OVERSIZE_WORDS = [
  {
    id: 'w-latin',
    headword: 'W'.repeat(200),
    reading: '',
    definition: 'W'.repeat(200),
    pos: ['名詞'],
    jlpt: 'レベル外',
    freq: 3,
    tags: [],
    learnedOn: '2026-06-23',
    createdAt: '2026-06-23T01:00:00.000Z',
    updatedAt: '2026-06-23T01:00:00.000Z',
  },
  {
    id: 'w-longja',
    headword: '龍の宮の乙姫の元結の上の外し'.repeat(4),
    reading: '',
    definition: '長い見出し語がカードの高さを決めてしまう場合。'.repeat(4),
    pos: ['名詞'],
    jlpt: 'レベル外',
    freq: 3,
    tags: [],
    learnedOn: '2026-06-23',
    createdAt: '2026-06-23T02:00:00.000Z',
    updatedAt: '2026-06-23T02:00:00.000Z',
  },
] satisfies SeedEntry[];

/**
 * A 単語集 whose name is far past its limit, holding the oversize entries.
 *
 * Stored data, not typed data: `maxLength` and `wordSetError` between them make
 * this unreachable through the form now, and every screen that renders a set
 * still has to survive one — a set written before the limit existed, or by
 * anything that is not this client.
 */
export const OVERSIZE_SET = [
  {
    id: 'set-oversize',
    name: 'W'.repeat(400),
    description: 'この単語集の説明。'.repeat(40),
    entryIds: ['w-latin', 'w-longja', 'w-kiriwake'],
  },
] satisfies SeedWordSet[];

/**
 * Must be called before the first navigation: `addInitScript` runs ahead of the
 * app's own scripts, which is the only point at which the in-memory adapters
 * can still read their seed.
 */
export async function seed(page: Page, data: E2ESeed = {}): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((value) => {
    (window as { __GOITEI_E2E__?: E2ESeed }).__GOITEI_E2E__ = value;
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
export const WORD_SETS = [
  { id: 'set-work', name: '仕事セット', entryIds: ['w-kiriwake', 'w-choukou'] },
] satisfies SeedWordSet[];

/**
 * One 単語集 holding all three words.
 *
 * Deleting one of them leaves a set whose stored `entryIds` is longer than the
 * rows it renders — the state in which a visible row index and a stored index
 * stop agreeing, and the only shape that can see it.
 */
export const FULL_SET = [
  {
    id: 'set-all',
    name: '全部セット',
    entryIds: ['w-kiriwake', 'w-choukou', 'w-chotto'],
  },
] satisfies SeedWordSet[];

/**
 * Two 単語集 that both claim 兆候.
 *
 * A word belongs to as many sets as it is put in — membership is a list on each
 * set, and nothing on the entry records which of them claimed it. That is what
 * makes deleting the word a question about several documents at once.
 */
export const OVERLAPPING_SETS = [
  { id: 'set-work', name: '仕事セット', entryIds: ['w-kiriwake', 'w-choukou'] },
  { id: 'set-news', name: 'ニュースセット', entryIds: ['w-choukou'] },
] satisfies SeedWordSet[];

/**
 * `count` finished sessions, newest last, an hour apart.
 *
 * Built rather than written out because the only thing being tested with more
 * than a couple of them is the cursor, and a page boundary needs more rows than
 * anybody wants to read in a fixture.
 */
export function makeSessions(count: number): SeedSession[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e2e-session-${index + 1}`,
    mode: index % 2 === 0 ? 'flashcard' : 'dictation',
    filterLabel: `記録 ${index + 1}`,
    total: 3,
    correct: index % 3,
    words: [],
    startedAt: new Date(Date.UTC(2026, 5, 1, index)).toISOString(),
    finishedAt: new Date(Date.UTC(2026, 5, 1, index, 5)).toISOString(),
  })) satisfies SeedSession[];
}
