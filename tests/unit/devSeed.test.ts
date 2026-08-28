import { describe, expect, it } from 'vitest';
import { dateKey } from '@/lib/dates';
import { devSeed } from '@/lib/devSeed';

/**
 * The seed `vite dev --mode e2e` comes up with when nobody has injected one.
 *
 * It is a fixture for a person rather than for a spec, so what is asserted here
 * is only what goes wrong silently. A word set that names an id the notebook
 * does not have renders one row short and a count to match — `membersOf`
 * resolves members against the notebook and simply drops the rest — so the
 * screen looks right and is wrong, which is the one failure nobody would catch
 * by opening the page.
 */
describe('devSeed', () => {
  const NOW = new Date('2026-08-28T10:00:00+09:00');
  const seed = devSeed(NOW);
  const ids = new Set((seed.entries ?? []).map((entry) => entry.id));

  it('gives every word a distinct id, so none of them silently replaces another', () => {
    expect(ids.size).toBe(seed.entries?.length);
  });

  it('names only words the notebook has in every 単語集, which would otherwise list short', () => {
    const dangling = (seed.wordSets ?? []).flatMap((set) =>
      (set.entryIds ?? []).filter((id) => !ids.has(id)).map((id) => `${set.id}: ${id}`),
    );
    expect(dangling).toEqual([]);
  });

  it('names only words the notebook has in 苦手 and in every missed list', () => {
    const missed = (seed.sessions ?? []).flatMap((session) => session.missed ?? []);
    expect([...(seed.weak ?? []), ...missed].filter((id) => !ids.has(id))).toEqual([]);
  });

  /**
   * The reason this is a function of `now` at all. Hard-coded dates would put
   * every word behind the dashboard's 今週 and leave the heatmap empty a year
   * after the seed was written — a dev server that demonstrates the app only on
   * the day somebody typed the fixture in.
   */
  it('moves its dates with the clock rather than being pinned to the day it was written', () => {
    const later = devSeed(new Date('2027-03-04T10:00:00+09:00'));
    const newest = (data: typeof seed) =>
      (data.entries ?? []).map((entry) => entry.learnedOn ?? '').sort();

    expect(newest(seed).at(-1)).toBe(dateKey(NOW));
    expect(newest(later).at(-1)).toBe('2027-03-04');
  });

  /** Signed in, or the dev server still opens on the login screen. */
  it('starts signed in, which is the whole point of not having to seed by hand', () => {
    expect(seed.signedIn).toBe(true);
    expect(seed.entries?.length).toBeGreaterThan(0);
    expect(seed.wordSets?.length).toBeGreaterThan(0);
  });
});
