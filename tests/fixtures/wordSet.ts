import type { WordSet } from '@/domain/wordSet';

/**
 * A complete, valid `WordSet`, so a test that cares about `entryIds` can
 * override it and trust the rest — the same bargain as `makeEntry`, and built
 * by hand for the same reason.
 */
export function makeWordSet(overrides: Partial<WordSet> = {}): WordSet {
  return {
    id: 'set-1',
    ownerUid: 'uid-alice',
    name: '仕事の語',
    description: '会議で出てきた語',
    entryIds: [],
    level: 'N2',
    topics: ['仕事'],
    publishedId: null,
    publishedVersion: 0,
    copiedFrom: null,
    createdAt: '2026-06-24T09:00:00.000Z',
    updatedAt: '2026-06-24T09:00:00.000Z',
    ...overrides,
  };
}
