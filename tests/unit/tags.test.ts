import { describe, expect, it } from 'vitest';
import { recentTags } from '@/lib/tags';
import { makeEntry } from '../fixtures/entry';

describe('recentTags', () => {
  it('returns at most ten unique tags from the newest entries', () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      makeEntry({
        id: `e-${index}`,
        tags: [`tag-${index}`, 'shared'],
        createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }),
    );

    expect(recentTags(entries)).toEqual([
      'tag-11',
      'shared',
      'tag-10',
      'tag-9',
      'tag-8',
      'tag-7',
      'tag-6',
      'tag-5',
      'tag-4',
      'tag-3',
    ]);
  });

  it('uses createdAt rather than the input or learning-date order', () => {
    const older = makeEntry({
      id: 'older',
      tags: ['older'],
      learnedOn: '2026-12-31',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = makeEntry({
      id: 'newer',
      tags: ['newer'],
      learnedOn: '2025-01-01',
      createdAt: '2026-02-01T00:00:00.000Z',
    });

    expect(recentTags([older, newer])).toEqual(['newer', 'older']);
  });
});
