import { describe, expect, it } from 'vitest';
import {
  dashboardStatsFor,
  parseBackfillVocabularyStatsArgs,
  sameDashboardStats,
} from '../../admin/backfill-vocabulary-stats.shared';

describe('backfill vocabulary stats arguments', () => {
  it('uses the dev project and verifies twenty users by default', () => {
    expect(parseBackfillVocabularyStatsArgs([])).toEqual({
      ok: true,
      projectId: 'goitei-dev',
      sampleSize: 20,
    });
  });

  it('rejects an invalid sample size instead of silently skipping production verification', () => {
    expect(parseBackfillVocabularyStatsArgs(['prod', '--sample', '0'])).toMatchObject({
      ok: false,
      errors: ['--sample requires a positive integer'],
    });
  });
});

describe('backfill vocabulary stats calculation', () => {
  it('matches the source entry counters, including overlapping parts of speech', () => {
    const expected = dashboardStatsFor([
      { learnedOn: '2026-06-24', jlpt: 'N2', pos: ['名詞', '動詞'] },
      { learnedOn: '2026-06-24', jlpt: 'N2', pos: ['名詞'] },
      { learnedOn: '2026-06-23', jlpt: 'N3', pos: [] },
    ]);

    expect(expected).toEqual({
      total: 3,
      countsByDay: { '2026-06-24': 2, '2026-06-23': 1 },
      jlptCounts: { N2: 2, N3: 1 },
      posCounts: { 名詞: 2, 動詞: 1 },
    });
    expect(sameDashboardStats({ ownerUid: 'u1', ...expected }, expected)).toBe(true);
  });
});
