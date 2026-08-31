import { describe, expect, it, vi } from 'vitest';
import type { EntryDraft } from '@/domain/entry';
import { POS } from '@/domain/entry';
import { ENTRY_LIMITS } from '@/domain/limits';
import {
  describeSizeProblem,
  draftError,
  draftSizeProblems,
  emptyDraft,
  invalidTags,
  parseTags,
  toDraft,
  togglePos,
} from '@/lib/draft';
import { wordSetError } from '@/lib/wordSetDraft';
import { makeEntry } from '../fixtures/entry';

describe('parseTags', () => {
  it.each([
    ['spaces', 'ニュース ビジネス 会議'],
    ['commas', 'ニュース,ビジネス,会議'],
    ['full-width commas', 'ニュース，ビジネス，会議'],
    ['Japanese commas', 'ニュース、ビジネス、会議'],
    ['a mixture, with runs of separators', 'ニュース、 ビジネス,,  会議'],
  ])('splits on %s', (_case, input) => {
    expect(parseTags(input)).toEqual(['ニュース', 'ビジネス', '会議']);
  });

  it('strips one leading hash, the way it is typed', () => {
    expect(parseTags('#ニュース #会議')).toEqual(['ニュース', '会議']);
    // Only the first: a second # is part of the tag and will fail validation.
    expect(parseTags('##ニュース')).toEqual(['#ニュース']);
  });

  it('de-duplicates while keeping first-seen order', () => {
    expect(parseTags('会議 ニュース 会議')).toEqual(['会議', 'ニュース']);
  });

  it.each(['', '   ', ',,,', '、 ，'])('returns nothing for %o', (input) => {
    expect(parseTags(input)).toEqual([]);
  });
});

describe('invalidTags', () => {
  /**
   * Tags end up in `?tag=…`, so they may contain any script's letters, digits
   * and underscores and nothing else. Kanji and kana are fine; whitespace and
   * punctuation are what would not survive the round trip readably.
   */
  it.each(['ニュース', '会議', 'business', 'JLPT_N1', '日本語2026', 'Ünïcode'])(
    'accepts %o',
    (tag) => {
      expect(invalidTags([tag])).toEqual([]);
    },
  );

  it.each(['#ニュース', 'two words', 'a-b', 'a/b', 'a.b', '', 'emoji🎌'])('rejects %o', (tag) => {
    expect(invalidTags([tag])).toEqual([tag]);
  });

  /**
   * Ten, not the thirty-two this allowed before. A tag is a filter chip and a
   * URL parameter, and one long enough to wrap the chip is one nothing can use.
   * The limit lives inside `TAG_PATTERN`, so tightening it also silently drops
   * a stored tag on read — `sanitize.test.ts` is where that half is pinned.
   */
  it('rejects a tag longer than 10 characters', () => {
    expect(invalidTags(['a'.repeat(10)])).toEqual([]);
    expect(invalidTags(['a'.repeat(11)])).toHaveLength(1);
  });

  it('reports only the offenders, not the whole list', () => {
    expect(invalidTags(['会議', 'two words', 'news'])).toEqual(['two words']);
  });
});

describe('toDraft', () => {
  /**
   * Written as destructure-and-discard so a field added to `Entry` reaches the
   * form by default. That makes the *excluded* set the thing worth pinning: it
   * is what the write path sets and the form may never send.
   */
  it('drops exactly the fields the form may not send', () => {
    const draft = toDraft(makeEntry());
    for (const field of [
      'id',
      'ownerUid',
      'publishedId',
      'publishedVersion',
      'copiedFrom',
      'createdAt',
      'updatedAt',
    ]) {
      expect(draft).not.toHaveProperty(field);
    }
  });

  it('keeps everything the user can edit', () => {
    const entry = makeEntry({ headword: '兆候', tags: ['ニュース'], freq: 4 });
    expect(toDraft(entry)).toMatchObject({
      headword: '兆候',
      tags: ['ニュース'],
      freq: 4,
      learnedOn: entry.learnedOn,
    });
  });
});

describe('emptyDraft', () => {
  /**
   * The clock is frozen rather than read twice. Building the expected key from
   * a real `new Date()` and then calling `emptyDraft()` is a race across
   * midnight — red a few times a year, on whichever CI run happens to straddle
   * it, and green on every rerun.
   */
  it("dates a new note today, in the learner's own calendar", () => {
    vi.useFakeTimers();
    try {
      // Local time, and deliberately single-digit in both components: it is
      // zero-padding that a naive implementation gets wrong.
      vi.setSystemTime(new Date(2026, 6, 5, 23, 59, 59));
      expect(emptyDraft().learnedOn).toBe('2026-07-05');

      vi.setSystemTime(new Date(2026, 11, 31, 0, 0, 1));
      expect(emptyDraft().learnedOn).toBe('2026-12-31');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts blank, with freq mid-scale and no level claimed', () => {
    expect(emptyDraft()).toMatchObject({
      headword: '',
      definition: '',
      jlpt: 'レベル外',
      freq: 3,
      pos: [],
      tags: [],
      pitchAccent: null,
      posInfo: null,
    });
  });

  it('returns a fresh object each time, so one form cannot edit another', () => {
    const a = emptyDraft();
    a.tags.push('会議');
    expect(emptyDraft().tags).toEqual([]);
  });
});

/**
 * The gate between the form and Firestore. It lives in `lib` rather than in the
 * save handler so it can be tested at all — `EntryFormModal` resolves its
 * repository through a provider that no component test may reach.
 *
 * The accent is why this exists in this shape. It had a red message under the
 * input and nothing refusing the value, and the two write paths spread the draft
 * straight into Firestore: `2.5` was stored and then coerced to `null` on the
 * next read, losing what was typed, while `9` on a three-mora word was stored,
 * kept, and drawn by nothing.
 */
describe('draftError', () => {
  /** The clock, frozen. `draftError` takes it so this file passes on any day. */
  const TODAY = '2026-06-24';

  const ok = (over: Partial<EntryDraft> = {}): EntryDraft => ({
    ...emptyDraft(),
    headword: '兆候',
    definition: '前ぶれ。',
    learnedOn: '2026-06-24',
    ...over,
  });

  it('passes a draft with everything it needs', () => {
    expect(draftError(ok(), TODAY)).toBeNull();
  });

  it('refuses the fields that were already refused before the accent existed', () => {
    expect(draftError(ok({ headword: '  ' }), TODAY)).toContain('見出し語');
    expect(draftError(ok({ definition: '' }), TODAY)).toContain('意味・説明');
    expect(draftError(ok({ tags: ['駄目 な タグ'] }), TODAY)).toContain('タグ');
    expect(draftError(ok({ learnedOn: '2026-02-31' }), TODAY)).toContain('学習日');
  });

  it('lets a well-formed accent through', () => {
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: 0 }), TODAY)).toBeNull();
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: 4 }), TODAY)).toBeNull();
    expect(draftError(ok({ pitchAccent: null }), TODAY)).toBeNull();
  });

  /** Stored and then coerced away on the next read — the value simply vanishes. */
  it('refuses an accent that is not a whole non-negative number', () => {
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: 2.5 }), TODAY)).not.toBeNull();
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: -1 }), TODAY)).not.toBeNull();
  });

  /** Stored, kept, and drawn by nothing: `pitchShape` refuses what it cannot place. */
  it('refuses an accent past the end of the reading', () => {
    expect(draftError(ok({ reading: 'たまご', pitchAccent: 9 }), TODAY)).toContain('3拍');
  });

  /**
   * A kanji headword with no reading has no mora count to check against, and
   * counting its characters would accept a number that means nothing.
   */
  it('refuses an accent on a word whose kana are unknown', () => {
    expect(draftError(ok({ headword: '兆候', reading: '', pitchAccent: 0 }), TODAY)).toContain(
      '読み方',
    );
    expect(draftError(ok({ headword: 'ちょっと', reading: '', pitchAccent: 0 }), TODAY)).toBeNull();
  });

  /**
   * A word cannot have been learned tomorrow, and nothing downstream treats the
   * date with any suspicion: 今週学んだ語, 今月, 今年 and every heatmap cell count
   * `learnedOn` directly. A typo of `2062` for `2026` therefore does not look
   * like an error anywhere — it silently leaves the word out of every statistic
   * for thirty-six years, and the word is still in the notebook, so nothing
   * about the totals looks wrong enough to investigate.
   */
  it('refuses a learning date in the future, which every dashboard count would then omit', () => {
    expect(draftError(ok({ learnedOn: '2026-06-25' }), TODAY)).toContain('学習日');
    expect(draftError(ok({ learnedOn: '2062-06-24' }), TODAY)).toContain('学習日');
    // The boundary itself is a word learned today, which is the common case.
    expect(draftError(ok({ learnedOn: TODAY }), TODAY)).toBeNull();
  });

  it('refuses a learning date before the floor, the same typo from the other side', () => {
    expect(draftError(ok({ learnedOn: '0202-06-24' }), TODAY)).toContain('学習日');
    expect(draftError(ok({ learnedOn: ENTRY_LIMITS.learnedOnFrom }), TODAY)).toBeNull();
  });

  it('refuses an over-long field, which nothing else in the save path would', () => {
    expect(draftError(ok({ headword: 'あ'.repeat(21) }), TODAY)).toContain('headword');
    expect(draftError(ok({ headword: 'あ'.repeat(20) }), TODAY)).toBeNull();
  });
});

/**
 * The nested limits, which exist here because they can exist nowhere else.
 *
 * `firestore.rules` cannot iterate a list — its own comments say so — so
 * `senses[2].description` is invisible to the security rules at any size, up to
 * Firestore's 1 MiB document ceiling. If these assertions go green while the
 * function is gone, nothing in the system bounds those fields at all.
 */
describe('draftSizeProblems', () => {
  const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
    ...emptyDraft(),
    headword: '兆候',
    definition: '前ぶれ。',
    ...over,
  });

  const sense = (over: Record<string, string> = {}) => ({
    label: '',
    description: '',
    example: '',
    exampleGloss: '',
    translation: '',
    usage: '',
    ...over,
  });

  it('finds nothing in an ordinary note', () => {
    expect(draftSizeProblems(draft())).toEqual([]);
  });

  it('reaches senses[2].description, which Firestore rules cannot see at any size', () => {
    const problems = draftSizeProblems(
      draft({ senses: [sense(), sense(), sense({ description: 'あ'.repeat(501) })] }),
    );

    expect(problems).toEqual([
      { path: 'senses[2].description', unit: 'characters', actual: 501, max: 500 },
    ]);
  });

  it('reaches context.original, which rules see only as one key of a map', () => {
    const problems = draftSizeProblems(
      draft({ context: { original: 'あ'.repeat(501), ja: '', translation: '' } }),
    );
    expect(problems.map((problem) => problem.path)).toEqual(['context.original']);
  });

  /**
   * Every violation, not the first. The JSON tab is the reason: a pasted note
   * with six oversize fields reported one at a time is six round trips through
   * an assistant, and nobody finishes that.
   */
  it('reports every oversize field at once rather than stopping at the first', () => {
    const problems = draftSizeProblems(
      draft({
        headword: 'あ'.repeat(21),
        definition: 'あ'.repeat(1001),
        source: 'あ'.repeat(101),
      }),
    );

    expect(problems.map((problem) => problem.path)).toEqual(['headword', 'definition', 'source']);
  });

  it('counts elements as well as characters', () => {
    const problems = draftSizeProblems(
      draft({ senses: Array.from({ length: 11 }, () => sense()) }),
    );
    expect(problems).toEqual([{ path: 'senses', unit: 'items', actual: 11, max: 10 }]);
  });

  /** The boundary. A limit that refuses the value equal to it is off by one. */
  it('accepts a value of exactly the limit', () => {
    expect(draftSizeProblems(draft({ definition: 'あ'.repeat(1000) }))).toEqual([]);
    expect(draftSizeProblems(draft({ definition: 'あ'.repeat(1001) }))).toHaveLength(1);
  });

  /**
   * The wording `localizeFormError` parses back into a message key. If the two
   * drift apart the message does not throw — it falls through and renders the
   * raw Japanese sentinel to a user who chose Spanish.
   */
  it('describes a problem in the shape localizeFormError parses', () => {
    expect(
      describeSizeProblem({ path: 'definition', unit: 'characters', actual: 1200, max: 1000 }),
    ).toBe('definition が長すぎます: 1200字（上限 1000字）。');
    expect(describeSizeProblem({ path: 'senses', unit: 'items', actual: 14, max: 10 })).toBe(
      'senses が多すぎます: 14件（上限 10件）。',
    );
  });
});

/**
 * The 単語集 side, which had no validator at all until it needed one.
 *
 * `WordSets` checked `name.trim()` and `WordSetEditModal` checked the same
 * thing, so a name's length was enforced only by the `maxLength` attribute —
 * a property of an input element, and therefore absent from every path that
 * does not go through one. The security rules allow 200 characters against the
 * product's 60, and that gap is what this closes.
 */
describe('wordSetError', () => {
  const ok = { name: '仕事', description: '' };

  it('passes an ordinary set', () => {
    expect(wordSetError(ok)).toBeNull();
  });

  it('still refuses a set with no name, which was the only rule before', () => {
    expect(wordSetError({ ...ok, name: '   ' })).toContain('名前');
  });

  /** The gap: maxLength stops typing, and nothing stopped the write. */
  it('refuses a name past the limit, which only the attribute stopped before', () => {
    expect(wordSetError({ ...ok, name: 'あ'.repeat(31) })).toContain('name');
    expect(wordSetError({ ...ok, name: 'あ'.repeat(30) })).toBeNull();
  });

  it('refuses an over-long description', () => {
    expect(wordSetError({ ...ok, description: 'あ'.repeat(201) })).toContain('description');
    expect(wordSetError({ ...ok, description: 'あ'.repeat(200) })).toBeNull();
  });

  /**
   * Measured after trimming, matching what `onSave` actually sends. Counting
   * the untrimmed value would refuse a 60-character name with a trailing space
   * that the write path was about to remove anyway.
   */
  it('measures the trimmed value, which is what the write path sends', () => {
    expect(wordSetError({ ...ok, name: `${'あ'.repeat(30)}   ` })).toBeNull();
  });
});

/**
 * 品詞 is a set, and the order it renders in is `POS`.
 *
 * Nothing downstream sorts it: `EntryHeadline` and the manifest row in
 * `EntryBody` map `entry.pos` as stored, and `sanitizeEntry` filters without
 * reordering. So an order that came out of the form in the order the chips
 * were pressed is the order that reached Firestore, came back, and was drawn —
 * two readers with the same two parts of speech seeing 名詞／動詞 and
 * 動詞／名詞.
 */
describe('togglePos', () => {
  it('returns the same order however the chips were pressed, which is what the display and the stored draft both take as given', () => {
    const forwards = togglePos(togglePos([], '名詞'), '動詞');
    const backwards = togglePos(togglePos([], '動詞'), '名詞');

    expect(forwards).toEqual(backwards);
    expect(forwards).toEqual(POS.filter((part) => part === '名詞' || part === '動詞'));
  });

  it('removes one without disturbing the order of the rest', () => {
    const [first, second, third] = POS;

    expect(togglePos([first, second, third], second)).toEqual([first, third]);
  });

  it('adds one that was not there and drops one that was', () => {
    expect(togglePos([], '名詞')).toEqual(['名詞']);
    expect(togglePos(['名詞'], '名詞')).toEqual([]);
  });
});
