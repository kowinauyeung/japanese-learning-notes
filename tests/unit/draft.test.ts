import { describe, expect, it, vi } from 'vitest';
import type { EntryDraft } from '@/domain/entry';
import { draftError, emptyDraft, invalidTags, parseTags, toDraft } from '@/lib/draft';
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

  it('rejects a tag longer than 32 characters', () => {
    expect(invalidTags(['a'.repeat(32)])).toEqual([]);
    expect(invalidTags(['a'.repeat(33)])).toHaveLength(1);
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
  const ok = (over: Partial<EntryDraft> = {}): EntryDraft => ({
    ...emptyDraft(),
    headword: '兆候',
    definition: '前ぶれ。',
    learnedOn: '2026-06-24',
    ...over,
  });

  it('passes a draft with everything it needs', () => {
    expect(draftError(ok())).toBeNull();
  });

  it('refuses the fields that were already refused before the accent existed', () => {
    expect(draftError(ok({ headword: '  ' }))).toContain('見出し語');
    expect(draftError(ok({ definition: '' }))).toContain('意味・説明');
    expect(draftError(ok({ tags: ['駄目 な タグ'] }))).toContain('タグ');
    expect(draftError(ok({ learnedOn: '2026-02-31' }))).toContain('学習日');
  });

  it('lets a well-formed accent through', () => {
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: 0 }))).toBeNull();
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: 4 }))).toBeNull();
    expect(draftError(ok({ pitchAccent: null }))).toBeNull();
  });

  /** Stored and then coerced away on the next read — the value simply vanishes. */
  it('refuses an accent that is not a whole non-negative number', () => {
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: 2.5 }))).not.toBeNull();
    expect(draftError(ok({ reading: 'ちょうこう', pitchAccent: -1 }))).not.toBeNull();
  });

  /** Stored, kept, and drawn by nothing: `pitchShape` refuses what it cannot place. */
  it('refuses an accent past the end of the reading', () => {
    expect(draftError(ok({ reading: 'たまご', pitchAccent: 9 }))).toContain('3拍');
  });

  /**
   * A kanji headword with no reading has no mora count to check against, and
   * counting its characters would accept a number that means nothing.
   */
  it('refuses an accent on a word whose kana are unknown', () => {
    expect(draftError(ok({ headword: '兆候', reading: '', pitchAccent: 0 }))).toContain('読み方');
    expect(draftError(ok({ headword: 'ちょっと', reading: '', pitchAccent: 0 }))).toBeNull();
  });
});
