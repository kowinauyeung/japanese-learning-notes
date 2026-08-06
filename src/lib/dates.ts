/**
 * Entry dates are plain `YYYY-MM-DD` strings with no timezone, meaning "the day
 * the word was learned" in the learner's own calendar. Everything here works in
 * local time on purpose — parsing them as UTC would shift days across the date
 * line and quietly move words between weeks.
 */

export function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
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
