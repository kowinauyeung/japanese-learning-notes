/**
 * Entry dates are plain `YYYY-MM-DD` strings with no timezone, meaning "the day
 * the word was learned" in the learner's own calendar. Everything here works in
 * local time on purpose — parsing them as UTC would shift days across the date
 * line and quietly move words between weeks.
 */

export function parseLocalDate(key: string): Date {
  // A malformed key leaves components missing, which is why they default to
  // NaN: `new Date(NaN, ...)` is the Invalid Date the callers already handled,
  // and is exactly what `undefined` coerced to before.
  const [y = NaN, m = NaN, d = NaN] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dateKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday-based, matching ISO-8601. */
export function startOfISOWeek(date: Date): Date {
  const start = new Date(date);
  const weekday = (start.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  start.setHours(0, 0, 0, 0);
  return addDays(start, -weekday);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

/** 「6/24」 — the compact form used in panel titles. */
export function shortDate(key: string): string {
  const date = parseLocalDate(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 「2025年6月24日」 — for the heatmap, which spans a full year and wraps past
 * the same month twice, so a bare 6/24 would not say which one.
 */
export function fullDate(key: string): string {
  const date = parseLocalDate(key);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * The same calendar day N months earlier, clamped to the end of a shorter month.
 *
 * `setMonth` on its own rolls forward instead of clamping: 3月31日 minus one
 * month is 2月31日, which `Date` reads as 3月3日 — so "the last month" would
 * start three days *after* it was asked for, and a range meant to widen would
 * quietly narrow. Moving to the 1st before shifting is what avoids landing on a
 * day the target month does not have.
 */
export function subtractMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const shifted = new Date(date);
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() - months);
  const lastDayOfTarget = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDayOfTarget));
  return shifted;
}
