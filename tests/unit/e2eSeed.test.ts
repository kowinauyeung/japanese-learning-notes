import { expect, test } from 'vitest';
import type { E2ESeed } from '@/lib/e2eSeed';
import { WORDS } from '../e2e/fixtures';

const validSeed: E2ESeed = {
  entries: [{ id: 'w-seeded', headword: '切り分け', definition: 'seeded entry' }],
};

// @ts-expect-error checked-in E2E seed literals should reject excess entry fields
const invalidSeed: E2ESeed = { entries: [{ typoField: 1 }] };

// @ts-expect-error checked-in E2E seed literals should require explicit entry ids
const missingIdSeed: E2ESeed = { entries: [{ headword: '切り分け' }] };

test('rejects excess fields in E2E entry seed literals', () => {
  void validSeed;
  void invalidSeed;
  void missingIdSeed;
  expect(WORDS.length).toBeGreaterThan(0);
});
