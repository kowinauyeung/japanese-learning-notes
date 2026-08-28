import type { EntryDashboardStats } from '../src/domain/ports';

export interface DashboardStatsEntry {
  learnedOn: string;
  jlpt: string;
  pos: string[];
}

export type ParsedBackfillVocabularyStatsArgs =
  | { ok: true; projectId: string; sampleSize: number }
  | { ok: false; errors: string[]; usage: string };

const USAGE =
  'usage: backfill-vocabulary-stats.ts [prod] [--project <project-id>] [--sample <positive integer>]';

export function parseBackfillVocabularyStatsArgs(
  args: string[],
): ParsedBackfillVocabularyStatsArgs {
  const errors: string[] = [];
  let prod = false;
  let projectId: string | null = null;
  let sampleSize = 20;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === 'prod') {
      prod = true;
      continue;
    }
    if (arg === '--project') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--project requires a project id');
        continue;
      }
      if (projectId) errors.push('--project specified multiple times');
      else projectId = value;
      index += 1;
      continue;
    }
    if (arg === '--sample') {
      const value = args[index + 1];
      const parsed = value ? Number(value) : Number.NaN;
      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        errors.push('--sample requires a positive integer');
      } else {
        sampleSize = parsed;
      }
      index += 1;
      continue;
    }
    errors.push(`unknown argument: ${arg}`);
  }

  if (prod && projectId) errors.push('choose either prod or --project <project-id>, not both');
  if (errors.length > 0) return { ok: false, errors, usage: USAGE };
  return { ok: true, projectId: projectId ?? (prod ? 'goitei' : 'goitei-dev'), sampleSize };
}

export function dashboardStatsFor(
  entries: Iterable<DashboardStatsEntry>,
): Omit<EntryDashboardStats, 'ownerUid'> {
  const countsByDay: Record<string, number> = {};
  const jlptCounts: Record<string, number> = {};
  const posCounts: Record<string, number> = {};
  let total = 0;

  for (const entry of entries) {
    total += 1;
    addCount(countsByDay, entry.learnedOn);
    addCount(jlptCounts, entry.jlpt);
    for (const part of entry.pos) addCount(posCounts, part);
  }

  return { total, countsByDay, jlptCounts, posCounts };
}

export function sameDashboardStats(
  actual: EntryDashboardStats,
  expected: Omit<EntryDashboardStats, 'ownerUid'>,
): boolean {
  return (
    actual.total === expected.total &&
    sameRecord(actual.countsByDay, expected.countsByDay) &&
    sameRecord(actual.jlptCounts, expected.jlptCounts) &&
    sameRecord(actual.posCounts, expected.posCounts)
  );
}

function addCount(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sameRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(([key, count]) => right[key] === count);
}
