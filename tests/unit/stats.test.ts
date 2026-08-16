import { describe, expect, it } from 'vitest';
import { summarise } from '@/lib/stats';
import { makeEntry } from '../fixtures/entry';

/**
 * The dashboard's counts, against a fixed `now` rather than whatever day CI
 * runs on. Every figure derives from `learnedOn` — the day the learner says
 * they met the word — and never from `createdAt`: back-filling a word learned
 * last month must not land it in this week.
 */

// A Wednesday. Its ISO week starts Monday 2026-06-22.
const NOW = new Date(2026, 5, 24, 10, 0, 0);

/** Deterministic, so a failure diff reads the same on every run. */
let sequence = 0;
const on = (learnedOn: string, overrides = {}) =>
  makeEntry({ id: `e${++sequence}-${learnedOn}`, learnedOn, ...overrides });

describe('summarise — period counts', () => {
  it('counts the current ISO week from its Monday, inclusive', () => {
    const summary = summarise(
      [on('2026-06-22'), on('2026-06-24'), on('2026-06-21'), on('2026-06-28')],
      NOW,
    );
    // The 21st is the Sunday *before* this week; the 28th is this week's Sunday.
    expect(summary.inWeek).toBe(3);
  });

  it('counts the month from the 1st and the year from January', () => {
    const summary = summarise(
      [on('2026-06-01'), on('2026-05-31'), on('2026-01-01'), on('2025-12-31')],
      NOW,
    );
    expect(summary.inMonth).toBe(1);
    expect(summary.inYear).toBe(3);
  });

  /** A word dated after today still belongs to this week, month and year. */
  it('includes a future date inside the same period', () => {
    const summary = summarise([on('2026-06-26')], NOW);
    expect([summary.inWeek, summary.inMonth, summary.inYear]).toEqual([1, 1, 1]);
  });

  it('returns zeroes and no rows for an empty notebook', () => {
    const summary = summarise([], NOW);
    expect([summary.inWeek, summary.inMonth, summary.inYear]).toEqual([0, 0, 0]);
    expect(summary.countsByDay.size).toBe(0);
    expect(summary.jlptRows).toEqual([]);
    expect(summary.posRows).toEqual([]);
  });

  /**
   * A calendar year is not a superset of an ISO week: the week containing
   * 1 January starts in the previous year, so a word learned on 2025-12-29
   * counts toward this week but not this year.
   */
  it('keeps the week and the year independent across a new year', () => {
    const newYear = new Date(2026, 0, 1, 10, 0, 0); // a Thursday
    const summary = summarise([on('2025-12-29'), on('2026-01-01')], newYear);
    expect(summary.inWeek).toBe(2);
    expect(summary.inYear).toBe(1);
  });
});

describe('summarise — countsByDay', () => {
  it('buckets by the date key, counting repeats', () => {
    const summary = summarise([on('2026-06-24'), on('2026-06-24'), on('2026-06-22')], NOW);
    expect(summary.countsByDay.get('2026-06-24')).toBe(2);
    expect(summary.countsByDay.get('2026-06-22')).toBe(1);
    expect(summary.countsByDay.has('2026-06-23')).toBe(false);
  });

  /** The heatmap spans a year, so days outside the current period still count. */
  it('keeps days from outside every period', () => {
    const summary = summarise([on('2020-01-01')], NOW);
    expect(summary.countsByDay.get('2020-01-01')).toBe(1);
    expect(summary.inYear).toBe(0);
  });
});

describe('summarise — distributions', () => {
  it('orders JLPT rows by level and omits levels with nothing in them', () => {
    const summary = summarise(
      [
        on('2026-06-24', { jlpt: 'N3' }),
        on('2026-06-24', { jlpt: 'N1' }),
        on('2026-06-24', { jlpt: 'N3' }),
        on('2026-06-24', { jlpt: 'レベル外' }),
      ],
      NOW,
    );
    expect(summary.jlptRows).toEqual([
      { label: 'N1', count: 1 },
      { label: 'N3', count: 2 },
      { label: 'レベル外', count: 1 },
    ]);
  });

  /** 品詞 has no natural order, so the only useful one is by size. */
  it('orders 品詞 rows by count, descending', () => {
    const summary = summarise(
      [
        on('2026-06-24', { pos: ['名詞'] }),
        on('2026-06-24', { pos: ['動詞', '名詞'] }),
        on('2026-06-24', { pos: ['名詞'] }),
        on('2026-06-24', { pos: ['副詞'] }),
      ],
      NOW,
    );
    expect(summary.posRows[0]).toEqual({ label: '名詞', count: 3 });
    expect(summary.posRows.map((row) => row.count)).toEqual([3, 1, 1]);
  });

  /** An entry with two parts of speech counts once under each. */
  it('counts a multi-part-of-speech entry under every one of them', () => {
    const summary = summarise([on('2026-06-24', { pos: ['名詞', '動詞'] })], NOW);
    expect(summary.posRows).toHaveLength(2);
    expect(summary.posRows.every((row) => row.count === 1)).toBe(true);
  });

  it('ignores an entry with no parts of speech rather than inventing a row', () => {
    const summary = summarise([on('2026-06-24', { pos: [] })], NOW);
    expect(summary.posRows).toEqual([]);
  });
});
