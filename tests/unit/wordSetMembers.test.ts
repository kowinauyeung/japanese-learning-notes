import { describe, expect, it } from 'vitest';
import { candidatesFor, membersOf, toDraft, withMember, withoutMember } from '@/lib/wordSetMembers';
import { makeEntry } from '../fixtures/entry';
import { makeWordSet } from '../fixtures/wordSet';

/**
 * Resolving a 単語集 against the notebook, which is every screen's first step:
 * membership is a list of ids and nothing on the entry side points back.
 */

const KIRIWAKE = makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ' });
const CHOUKOU = makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう' });
const HAKKIRI = makeEntry({ id: 'w3', headword: 'はっきり', reading: 'はっきり' });
const NOTEBOOK = [KIRIWAKE, CHOUKOU, HAKKIRI];

describe('membersOf', () => {
  /**
   * The stored order *is* the study order — it is the reason membership lives
   * on the set rather than on the entry. Resolving through the notebook's own
   * order would silently sort the set by when each word was added instead.
   */
  it('returns the words in the set’s order, not the notebook’s', () => {
    const set = makeWordSet({ entryIds: ['w3', 'w1', 'w2'] });
    expect(membersOf(set, NOTEBOOK).map((entry) => entry.headword)).toEqual([
      'はっきり',
      '切り分け',
      '兆候',
    ]);
  });

  /**
   * Deleting a word does not visit the sets that named it, so a set outlives
   * its members. Counting the id anyway is what makes 「3 語」 sit above a list
   * of two, and makes a practice chip promise cards the queue cannot deal.
   */
  it('drops an id whose word has been deleted instead of counting it', () => {
    const set = makeWordSet({ entryIds: ['w1', 'gone', 'w2'] });
    expect(membersOf(set, NOTEBOOK).map((entry) => entry.id)).toEqual(['w1', 'w2']);
  });
});

describe('candidatesFor', () => {
  const empty = makeWordSet();

  it('matches on the reading, not only on the headword', () => {
    expect(candidatesFor(empty, NOTEBOOK, 'ちょうこう').map((entry) => entry.id)).toEqual(['w2']);
  });

  /**
   * Offering a word that is already in the set gives a ＋追加 button that
   * writes nothing — indistinguishable, from the other side of the screen,
   * from a save that failed.
   */
  it('does not offer a word the set already holds', () => {
    const set = makeWordSet({ entryIds: ['w2'] });
    expect(candidatesFor(set, NOTEBOOK, 'ちょう')).toEqual([]);
  });

  /** A picker that answers an empty box with the whole notebook is a list. */
  it('suggests nothing until something is typed', () => {
    expect(candidatesFor(empty, NOTEBOOK, '   ')).toEqual([]);
  });

  it('stops at the limit rather than rendering every match', () => {
    // 「り」 is in 切り分け and はっきり both, so a limit of 1 has something to cut.
    expect(candidatesFor(empty, NOTEBOOK, 'り')).toHaveLength(2);
    expect(candidatesFor(empty, NOTEBOOK, 'り', 1).map((entry) => entry.id)).toEqual(['w1']);
  });
});

describe('withMember', () => {
  /** Prepending would reorder a set every time a word joined it. */
  it('appends, leaving the existing study order alone', () => {
    expect(withMember(['w1', 'w2'], 'w3')).toEqual(['w1', 'w2', 'w3']);
  });

  /** A repeated id deals the same card twice in one session. */
  it('ignores a word the set already holds', () => {
    expect(withMember(['w1', 'w2'], 'w1')).toEqual(['w1', 'w2']);
  });
});

describe('withoutMember', () => {
  it('removes only the word asked for, in place', () => {
    expect(withoutMember(['w1', 'w2', 'w3'], 'w2')).toEqual(['w1', 'w3']);
  });
});

/**
 * Every write sends a whole draft, so anything `toDraft` forgets is a field the
 * next rename silently clears. `level` and `topics` have no form yet, which is
 * exactly why they are the ones that can disappear without anybody noticing.
 */
describe('toDraft', () => {
  it('carries through the fields no form on screen can restore', () => {
    const set = makeWordSet({ level: 'N1', topics: ['旅行'], entryIds: ['w1'] });
    expect(toDraft(set)).toEqual({
      name: set.name,
      description: set.description,
      entryIds: ['w1'],
      level: 'N1',
      topics: ['旅行'],
    });
  });
});
