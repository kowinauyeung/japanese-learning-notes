import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKey,
  fullDate,
  parseLocalDate,
  shortDate,
  startOfISOWeek,
  startOfMonth,
  startOfYear,
} from '@/lib/dates';

/**
 * Entry dates are plain `YYYY-MM-DD` strings meaning "the day the word was
 * learned" in the learner's own calendar, with no timezone. Everything here
 * works in local time on purpose: parsing a key as UTC shifts days across the
 * date line and quietly moves words between weeks, which is exactly the kind of
 * off-by-one nobody notices until a dashboard count looks wrong.
 *
 * The assertions below therefore compare *components* (year, month, date) and
 * never an absolute instant, so they hold in any timezone CI runs in.
 */

const components = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

describe('parseLocalDate', () => {
  it('reads the key in local time, not UTC', () => {
    // The regression this guards: `new Date('2026-06-24')` is UTC midnight,
    // which is the 23rd anywhere west of Greenwich.
    expect(components(parseLocalDate('2026-06-24'))).toEqual([2026, 6, 24]);
    expect(parseLocalDate('2026-06-24').getHours()).toBe(0);
  });

  it.each(['', 'yesterday', '2026-06', 'x-y-z'])(
    'returns an Invalid Date for the malformed %o, rather than a plausible one',
    (key) => {
      expect(Number.isNaN(parseLocalDate(key).getTime())).toBe(true);
    },
  );

  it('round-trips through dateKey', () => {
    expect(dateKey(parseLocalDate('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('dateKey', () => {
  it('zero-pads month and day so keys sort as strings', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('produces keys whose string order is chronological', () => {
    const keys = [new Date(2026, 8, 1), new Date(2026, 0, 5), new Date(2026, 11, 31)].map(dateKey);
    expect([...keys].sort()).toEqual(['2026-01-05', '2026-09-01', '2026-12-31']);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(dateKey(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
  });

  it('crosses a year boundary in both directions', () => {
    expect(dateKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
    expect(dateKey(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(dateKey(addDays(new Date(2024, 1, 28), 1))).toBe('2024-02-29');
    expect(dateKey(addDays(new Date(2025, 1, 28), 1))).toBe('2025-03-01');
  });

  it('does not mutate its argument', () => {
    const original = new Date(2026, 5, 24);
    addDays(original, 10);
    expect(dateKey(original)).toBe('2026-06-24');
  });
});

describe('startOfISOWeek', () => {
  /**
   * ISO weeks start on Monday. Sunday is the trap: `getDay()` calls it 0, so the
   * naive `-getDay()` would jump forward into the coming week instead of back
   * to the Monday six days earlier — moving every Sunday's words into the next
   * week's count.
   */
  it('treats Sunday as the last day of the week, not the first', () => {
    // 2026-06-28 is a Sunday; its ISO week began Monday the 22nd.
    expect(dateKey(startOfISOWeek(new Date(2026, 5, 28)))).toBe('2026-06-22');
  });

  it('returns the same day for a Monday', () => {
    expect(dateKey(startOfISOWeek(new Date(2026, 5, 22)))).toBe('2026-06-22');
  });

  it.each([
    [23, 'Tuesday'],
    [24, 'Wednesday'],
    [25, 'Thursday'],
    [26, 'Friday'],
    [27, 'Saturday'],
  ])('maps the %i (%s) back to the same Monday', (day) => {
    expect(dateKey(startOfISOWeek(new Date(2026, 5, day)))).toBe('2026-06-22');
  });

  it('reaches back across a month and a year boundary', () => {
    // 2026-01-01 is a Thursday, so its week starts in the previous year.
    expect(dateKey(startOfISOWeek(new Date(2026, 0, 1)))).toBe('2025-12-29');
  });

  it('starts the boundary at local midnight, so a same-day entry counts', () => {
    const start = startOfISOWeek(new Date(2026, 5, 24, 15, 30));
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    expect(parseLocalDate('2026-06-24') >= start).toBe(true);
  });

  it('does not mutate its argument', () => {
    const original = new Date(2026, 5, 28, 12, 0, 0);
    startOfISOWeek(original);
    expect(dateKey(original)).toBe('2026-06-28');
    expect(original.getHours()).toBe(12);
  });
});

describe('startOfMonth and startOfYear', () => {
  it('return local midnight on the first day', () => {
    const month = startOfMonth(new Date(2026, 5, 24, 23, 59));
    expect(components(month)).toEqual([2026, 6, 1]);
    expect(month.getHours()).toBe(0);

    const year = startOfYear(new Date(2026, 5, 24, 23, 59));
    expect(components(year)).toEqual([2026, 1, 1]);
    expect(year.getHours()).toBe(0);
  });

  it('include an entry learned on the boundary day itself', () => {
    expect(parseLocalDate('2026-06-01') >= startOfMonth(new Date(2026, 5, 15))).toBe(true);
    expect(parseLocalDate('2026-01-01') >= startOfYear(new Date(2026, 5, 15))).toBe(true);
  });

  it('exclude the day before the boundary', () => {
    expect(parseLocalDate('2026-05-31') >= startOfMonth(new Date(2026, 5, 15))).toBe(false);
    expect(parseLocalDate('2025-12-31') >= startOfYear(new Date(2026, 5, 15))).toBe(false);
  });
});

describe('display formatting', () => {
  it('renders the compact form without padding', () => {
    expect(shortDate('2026-06-24')).toBe('6/24');
    expect(shortDate('2026-01-05')).toBe('1/5');
  });

  /** The heatmap spans a year and wraps past the same month twice. */
  it('renders the full form with the year', () => {
    expect(fullDate('2025-06-24')).toBe('2025年6月24日');
  });
});
