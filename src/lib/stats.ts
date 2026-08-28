import { JLPT_LEVELS } from '@/domain/entry';
import type { Entry } from '@/domain/entry';
import type { EntryDashboardStats } from '@/domain/ports';
import { dateKey, parseLocalDate, startOfISOWeek, startOfMonth, startOfYear } from './dates';

/**
 * The dashboard's aggregation, lifted out of the route so it can be tested
 * against a fixed `now` rather than whatever day CI happens to run on.
 *
 * Every count is derived from `learnedOn` — the day the learner says they met
 * the word — and not from `createdAt`, which is when the row reached Firestore.
 * Back-filling a word learned last month must not land it in this week.
 */

export interface DistributionRow {
  label: string;
  count: number;
}

export interface Summary {
  /** `YYYY-MM-DD` → number of entries learned that day; feeds the heatmap. */
  countsByDay: Map<string, number>;
  inWeek: number;
  inMonth: number;
  inYear: number;
  /** Fixed JLPT order, with levels nobody has studied omitted entirely. */
  jlptRows: DistributionRow[];
  /** Descending by count, since there is no natural order over 品詞. */
  posRows: DistributionRow[];
}

export function summarise(entries: Entry[], now: Date): Summary {
  const week = startOfISOWeek(now);
  const month = startOfMonth(now);
  const year = startOfYear(now);

  const countsByDay = new Map<string, number>();
  let inWeek = 0;
  let inMonth = 0;
  let inYear = 0;
  const jlpt = new Map<string, number>();
  const pos = new Map<string, number>();

  for (const entry of entries) {
    // Parsed in local time on purpose: the boundaries above are local midnights,
    // and parsing the key as UTC would move a word into the previous day for
    // anyone east of Greenwich.
    const learned = parseLocalDate(entry.learnedOn);
    countsByDay.set(entry.learnedOn, (countsByDay.get(entry.learnedOn) ?? 0) + 1);
    if (learned >= week) inWeek += 1;
    if (learned >= month) inMonth += 1;
    if (learned >= year) inYear += 1;
    jlpt.set(entry.jlpt, (jlpt.get(entry.jlpt) ?? 0) + 1);
    for (const part of entry.pos) pos.set(part, (pos.get(part) ?? 0) + 1);
  }

  return {
    countsByDay,
    inWeek,
    inMonth,
    inYear,
    jlptRows: JLPT_LEVELS.filter((level) => jlpt.has(level)).map((level) => ({
      label: level,
      count: jlpt.get(level) ?? 0,
    })),
    posRows: [...pos.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function summaryFromDashboardStats(stats: EntryDashboardStats, now: Date): Summary {
  const countsByDay = new Map(
    Object.entries(stats.countsByDay).filter(([, count]) => Number.isFinite(count) && count > 0),
  );
  const periods = periodCountsFromDays(countsByDay, now);
  return {
    countsByDay,
    inWeek: periods.inWeek,
    inMonth: periods.inMonth,
    inYear: periods.inYear,
    jlptRows: JLPT_LEVELS.map((level) => ({
      label: level,
      count: stats.jlptCounts[level] ?? 0,
    })).filter((row) => row.count > 0),
    posRows: Object.entries(stats.posCounts)
      .filter(([, count]) => Number.isFinite(count) && count > 0)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function dashboardStatsFromSummary(
  summary: Summary,
  total: number,
): Omit<EntryDashboardStats, 'ownerUid'> {
  return {
    total,
    countsByDay: Object.fromEntries(summary.countsByDay),
    jlptCounts: Object.fromEntries(summary.jlptRows.map((row) => [row.label, row.count])),
    posCounts: Object.fromEntries(summary.posRows.map((row) => [row.label, row.count])),
  };
}

function periodCountsFromDays(countsByDay: Map<string, number>, now: Date) {
  const weekStart = dateKey(startOfISOWeek(now));
  const monthStart = dateKey(startOfMonth(now));
  const yearStart = dateKey(startOfYear(now));
  let inWeek = 0;
  let inMonth = 0;
  let inYear = 0;

  for (const [day, count] of countsByDay) {
    if (day >= weekStart) inWeek += count;
    if (day >= monthStart) inMonth += count;
    if (day >= yearStart) inYear += count;
  }

  return { inWeek, inMonth, inYear };
}
