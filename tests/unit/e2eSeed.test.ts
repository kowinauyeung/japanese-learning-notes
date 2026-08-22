import { expect, test } from 'vitest';
import type { E2ESeed } from '@/lib/e2eSeed';
import { WORDS } from '../e2e/fixtures';

const validSeed: E2ESeed = {
  entries: [{ id: 'w-seeded', headword: '切り分け', definition: 'seeded entry' }],
};

// @ts-expect-error checked-in E2E seed literals should reject excess entry fields
const invalidSeed: E2ESeed = { entries: [{ typoField: 1 }] };

test('shared E2E seed fixtures stay entry-shaped', () => {
  void validSeed;
  void invalidSeed;
  expect(WORDS.length).toBeGreaterThan(0);
});
