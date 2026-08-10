import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from '@/lib/filters';
import {
  candidatesFor,
  insertMemberAt,
  membersOf,
  reorderMembers,
  toDraft,
  withMember,
  withoutMember,
} from '@/lib/wordSetMembers';
import { makeEntry } from '../fixtures/entry';
import { makeWordSet } from '../fixtures/wordSet';

/**
 * Resolving a 単語集 against the notebook, which is every screen's first step:
 * membership is a list of ids and nothing on the entry side points back.
 */

/** Distinct learning dates, because the picker's default order is by them. */
const KIRIWAKE = makeEntry({
  id: 'w1',
  headword: '切り分け',
  reading: 'きりわけ',
  learnedOn: '2026-06-24',
});
const CHOUKOU = makeEntry({
  id: 'w2',
  headword: '兆候',
  reading: 'ちょうこう',
  learnedOn: '2026-06-22',
  jlpt: 'N1',
});
const HAKKIRI = makeEntry({
  id: 'w3',
  headword: 'はっきり',
  reading: 'はっきり',
  learnedOn: '2026-01-15',
});
/** Deliberately not in date order, so a test that expects one proves it. */
const NOTEBOOK = [CHOUKOU, HAKKIRI, KIRIWAKE];

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
  const ids = (result: { shown: { id: string }[] }) => result.shown.map((entry) => entry.id);

  /**
   * The picker opens on the notebook, newest first, before a filter is touched.
   * A word is usually filed into a set soon after it is written down, so the
   * ones worth offering unprompted are the recent ones — and a list that starts
   * empty leaves the drag gesture with nothing to be discovered on.
   */
  it('starts on the whole notebook, most recently learned first', () => {
    expect(ids(candidatesFor(empty, NOTEBOOK, EMPTY_FILTERS))).toEqual(['w1', 'w2', 'w3']);
  });

  it('narrows on the search term, over readings as well as headwords', () => {
    expect(ids(candidatesFor(empty, NOTEBOOK, { ...EMPTY_FILTERS, q: 'ちょうこう' }))).toEqual([
      'w2',
    ]);
  });

  /**
   * The same 一覧 filters over the same predicate, so a word that a filter
   * combination finds on 一覧 is findable by that combination here. A second
   * search implementation is how that stops being true.
   */
  it('narrows on a filter the search box cannot express', () => {
    expect(ids(candidatesFor(empty, NOTEBOOK, { ...EMPTY_FILTERS, jlpt: ['N1'] }))).toEqual(['w2']);
  });

  /**
   * Offering a word that is already in the set gives a ＋追加 button that
   * writes nothing — indistinguishable, from the other side of the screen,
   * from a save that failed.
   */
  it('does not offer a word the set already holds', () => {
    const set = makeWordSet({ entryIds: ['w2'] });
    expect(ids(candidatesFor(set, NOTEBOOK, EMPTY_FILTERS))).toEqual(['w1', 'w3']);
  });

  /**
   * The cap is a drag constraint, not a paging one: reaching row 200 means
   * scrolling the drop target off screen mid-gesture. `total` is what tells the
   * learner to narrow rather than scroll, so it counts the matches and not the
   * rows.
   */
  it('caps the rows but still reports how many matched', () => {
    expect(candidatesFor(empty, NOTEBOOK, EMPTY_FILTERS, 2)).toEqual({
      shown: [KIRIWAKE, CHOUKOU],
      total: 3,
    });
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
 * `to` is an insertion point in the *original* array's coordinates — the gap
 * the drop indicator was drawn in. Removing the moved item first shifts
 * everything after it down by one, and forgetting that is the classic off-by-one
 * that makes every downward drag land one row short of where it was released.
 */
describe('reorderMembers', () => {
  /**
   * Dropped into the gap between w2 and w3 — index 2 while w1 is still in the
   * list. Landing at index 2 *after* w1 has been lifted out puts it after w3
   * instead, one row further than the indicator promised.
   */
  it('lands where the indicator was drawn when moving down', () => {
    expect(reorderMembers(['w1', 'w2', 'w3'], 0, 2)).toEqual(['w2', 'w1', 'w3']);
  });

  it('lands where the indicator was drawn when moving up', () => {
    expect(reorderMembers(['w1', 'w2', 'w3'], 2, 0)).toEqual(['w3', 'w1', 'w2']);
  });

  /** Both gaps touching a row mean "leave it alone", or a nudge costs a write. */
  it.each([1, 2])('does nothing dropping row 1 into gap %i', (to) => {
    expect(reorderMembers(['w1', 'w2', 'w3'], 1, to)).toEqual(['w1', 'w2', 'w3']);
  });

  /**
   * What ArrowUp on the first row asks for. A negative index counts back from
   * the end in `splice`, so without the clamp the top row would jump to second
   * place — the opposite of the key that was pressed.
   */
  it('leaves the first row alone when it is moved up', () => {
    expect(reorderMembers(['w1', 'w2', 'w3'], 0, -1)).toEqual(['w1', 'w2', 'w3']);
  });

  /** A row index left over from a list that has since been refreshed shorter. */
  it('leaves the list alone when asked to move a row that is not there', () => {
    expect(reorderMembers(['w1', 'w2'], 7, 0)).toEqual(['w1', 'w2']);
  });
});

/**
 * A drop target cannot tell whether what landed on it came from the notebook or
 * from three rows further up its own list, so one function has to answer both.
 */
describe('insertMemberAt', () => {
  it('inserts a word from outside at the gap it was dropped in', () => {
    expect(insertMemberAt(['w1', 'w2'], 'w3', 1)).toEqual(['w1', 'w3', 'w2']);
  });

  /** Otherwise dragging a member onto a new position duplicates it. */
  it('moves a word the set already holds rather than adding it twice', () => {
    expect(insertMemberAt(['w1', 'w2', 'w3'], 'w3', 0)).toEqual(['w3', 'w1', 'w2']);
  });

  it('appends when the gap is past the end', () => {
    expect(insertMemberAt(['w1'], 'w2', 99)).toEqual(['w1', 'w2']);
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
