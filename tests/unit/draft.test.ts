import { describe, expect, it } from 'vitest';
import { emptyDraft, invalidTags, parseTags, toDraft } from '@/lib/draft';
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
  it("dates a new note today, in the learner's own calendar", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    expect(emptyDraft().learnedOn).toBe(expected);
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
