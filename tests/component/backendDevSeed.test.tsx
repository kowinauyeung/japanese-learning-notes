import { describe, expect, it } from 'vitest';
import { entryRepositoryFor, wordSetRepositoryFor } from '@/lib/backend';

/**
 * The dev-server default must not reach this project.
 *
 * `vitest.config.ts` aliases `@/lib/backend` to `backend.e2e.ts` here, and that
 * module now falls back to `devSeed` when nothing has installed
 * `window.__GOITEI_E2E__`. The predicate guarding it is
 * `import.meta.env.DEV && import.meta.env.MODE === 'e2e'`, and vitest satisfies
 * the first half — `DEV` is true under the test runner, and only the mode tells
 * a hand-driven dev server apart from it.
 *
 * Written against the repositories rather than against the flag, because what
 * goes wrong is not a boolean: `JsonImport.test.tsx` deletes
 * `window.__GOITEI_E2E__` in `afterEach`, so a leak hands the *next* case
 * thirteen words and four word sets it never asked for. A component test that
 * counts rows would then pass or fail depending on which file ran before it.
 *
 * A `.tsx` extension it does not need, because that is what this project's
 * `include` matches.
 */
describe('the aliased end-to-end backend, with no seed installed', () => {
  it('reads an empty notebook rather than the dev server default', async () => {
    const page = await entryRepositoryFor('vitest-uid').list({ limit: 50, cursor: null });
    expect(page.items).toEqual([]);
  });

  it('reads no 単語集 either', async () => {
    const page = await wordSetRepositoryFor('vitest-uid').list({ limit: 50, cursor: null });
    expect(page.items).toEqual([]);
  });
});
