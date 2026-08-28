# Dashboard on-demand vocabulary handoff

## Working agreement

- Reply to the user in Cantonese, using Traditional Chinese. Keep repository
  artifacts (commits, branches, PRs, GitHub issues, and review replies) in
  English.
- Read `AGENTS.md` before changing code. In particular, shared port changes
  require enumerating downstream consumers, and regression tests must be proven
  red before the fix is claimed green.
- Use `apply_patch` for edits. Use `gh` for GitHub operations.
- Do not commit without proposing the exact commit message and receiving the
  user's explicit approval.

## Repository state

- Repository: `/Users/kowin/Documents/japanese-learning-notes`
- Branch: `feat/dashboard-on-demand-vocab`
- Base: `develop`
- Existing GitHub issue: #140, `Backfill vocabulary dashboard stats after
deploy` (<https://github.com/kowinauyeung/japanese-learning-notes/issues/140>)
- No pull request has been opened yet.
- The worktree currently has one intentional, uncommitted partial change in
  `src/domain/ports.ts`:

  ```ts
  saveDashboardStats(stats: Omit<EntryDashboardStats, 'ownerUid'>): Promise<void>;
  ```

  It is only a port declaration. Its implementations, consumers, and tests have
  not yet been added.

## Relevant commits

- `2f7f46d feat(dashboard): load vocabulary stats on demand`
- `161397d fix(dashboard): keep vocabulary stats consistent`
- `57345d3 fix(dashboard): refresh stats after vocabulary edits`

## Status update

The review blockers below have now been implemented in the uncommitted
worktree. `saveDashboardStats()` bootstraps a complete cache document after the
Dashboard fallback drain. CRUD awaits the stats delta before resolving, and the
Dashboard derives period totals from cached day buckets rather than three server
aggregates. The focused adapter regression was proven red by restoring
`void writeStatsDelta(...)`, which read `total: 0` after create, then green with
the awaited implementation. Full emulator verification passes with 113 tests.

## Feature implemented so far

The branch moves Dashboard reads away from an unconditional full notebook load.

- Firestore dashboard cache document: `users/{uid}/stats/vocabulary`.
- `EntryRepository` has dashboard-specific read methods: `dashboardStats`,
  `countLearnedSince`, `recentLearned`, `listLearnedOn`, and `wordOfDay`.
- Vocabulary paging and selected-day heatmap reads use cursors and drain every
  page when a selected day is opened.
- Dashboard edits propagate through `EntriesProvider.mutationVersion`, so the
  Dashboard reloads after a dialog save without loading the whole notebook.
- Account deletion explicitly removes `stats/vocabulary` after writing the
  tombstone, avoiding stale user statistics.
- Firestore rule access for `stats/vocabulary` is owner-gated and create/update
  are tombstone-gated.
- `statsDelta` accumulates numeric deltas before producing Firestore
  `increment()` values, fixing path-overwrite inflation for no-op counter edits
  and partially overlapping `pos` arrays.
- Word of the day seed uses the Firestore auto-ID alphabet rather than a
  left-zero-padded value.

## Historical review blockers

### 1. Bootstrap missing dashboard stats

`writeStatsDelta()` in `src/infra/firebase/entryRepo.ts` returns when the stats
document does not exist. `Dashboard` falls back to draining all entries and
computing a `Summary`, but never persists that computed result. New accounts and
accounts not yet backfilled will therefore keep full-reading the notebook.

Recommended direction:

1. Keep the already-added `saveDashboardStats` port method.
2. Implement it in `src/infra/firebase/entryRepo.ts`. It should create the
   complete stats document for the current owner, including `ownerUid`, total,
   `countsByDay`, `jlptCounts`, `posCounts`, and `updatedAt`.
3. Add the matching implementation to `src/lib/backend.e2e.ts` and every test
   fake that implements `EntryRepository`.
4. In `src/routes/Dashboard.tsx`, after fallback `drainEntries()` and
   `summarise(all, now)`, persist the calculated stats before completing the
   Dashboard load. The UI may still render the already calculated fallback
   summary; the important property is that the next visit uses the cache.

Consider offline behavior deliberately. Existing Firestore writes use
`LocalWriteTracker`, so a local Firestore cache write can resolve the user save
flow without waiting for server acknowledgement.

### 2. Stats update is not part of mutation completion

`create`, `update`, and `remove` currently use `void writeStatsDelta(...)`.
The entry mutation can complete, `syncAfterMutation()` can bump
`mutationVersion`, and Dashboard can read the old stats doc before the delta is
locally queued. It then treats that old doc as authoritative until the next
reload.

Recommended direction:

1. Make `create`, `update`, and `remove` await `writeStatsDelta(...)` after
   their entry mutation has locally completed.
2. Preserve the existing expected-error handling for a missing/unavailable
   stats document so an offline entry save does not hang or fail merely because
   the cache has not been bootstrapped.
3. Add an integration regression test proving that immediately after awaiting a
   repository mutation, `dashboardStats()` observes the local delta. Before the
   fix, temporarily restore the `void writeStatsDelta(...)` behavior and confirm
   only the intended regression test fails; then restore the awaited behavior
   and rerun it green.

## Review suggestion worth including

Dashboard currently calls the server aggregate `countLearnedSince()` three
times for week/month/year even when `storedStats.countsByDay` is available.
Replace that with a pure helper in `src/lib/stats.ts` that totals day buckets for
the three date ranges. This removes three server-only reads and works from the
cached stats document offline.

Likely shape:

```ts
summaryFromDashboardStats(stats, now);
```

instead of passing separately queried period counts into the helper. Add unit
tests in `tests/unit/stats.test.ts` because this is date/map arithmetic, not a
Firestore query behavior.

## Shared port downstream consumers

The new `saveDashboardStats` method changes `EntryRepository`. Update all
implementations and structural fakes before typechecking:

- `src/infra/firebase/entryRepo.ts`
- `src/lib/backend.e2e.ts`
- test repository fakes, including `tests/unit/accountData.test.ts`
- any other `EntryRepository` object literals found with
  `rg "EntryRepository|removeDashboardStats" src tests`

The `Summary` and dashboard-stat conversion helpers are used by:

- `src/routes/Dashboard.tsx`
- `tests/unit/stats.test.ts`

## Existing tests and prior red checks

`tests/integration/entryRepo.test.ts` already covers:

- create, update, and remove stats counter values at each step;
- dashboard stats deletion;
- non-counter edits followed by a date move (prevents counter inflation);
- partial `pos` overlap edits (prevents incorrect part-of-speech deltas).

For the last two tests, the previous agent temporarily reintroduced the old
per-path overwrite implementation. Both tests failed with inflated counters,
then passed after restoring accumulated numeric deltas.

New tests needed:

- A unit test for day-bucket period totals, if the suggested helper is added.
- An integration test for immediate post-mutation stats visibility.
- Coverage that Dashboard fallback persists a full stats document. Prefer the
  cheapest layer that can see the behavior. A pure conversion helper belongs in
  unit tests; Firestore document/query semantics belong in integration tests.

## Previous verification

Passed after `57345d3`:

- `yarn typecheck`
- `yarn lint` (18 existing warnings, no errors)
- `yarn vitest run tests/unit/accountData.test.ts tests/unit/stats.test.ts`
  (30 tests)
- focused `entryRepo` emulator tests (21 tests)
- `yarn test:emulator` (7 files, 112 tests)

Known environment issue:

- `yarn test:unit` has a pre-existing local failure because
  `inter-latin-400-normal.woff2` is missing from `node_modules`; reviewer
  reported all other 916 tests passing.

For emulator tests on macOS, use JDK 21 first on `PATH` as documented in
`AGENTS.md`. Localhost emulator ports may require sandbox escalation.

## Before opening a PR

1. Run `yarn format` and include formatter changes.
2. Run `yarn typecheck`, focused unit/integration tests, and then the relevant
   full suites where practical.
3. State the test layer and the red-to-green proof in the PR description.
4. Propose a commit message and wait for explicit user approval before commit.
5. Do not create the PR until the user asks. After creating it, link issue #140
   to the PR as requested by the user.
