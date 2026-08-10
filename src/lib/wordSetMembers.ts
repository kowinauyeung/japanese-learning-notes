import type { Entry } from '@/domain/entry';
import type { WordSet, WordSetDraft } from '@/domain/wordSet';

/**
 * Turning a 単語集 into the words it holds, and back into something writable.
 *
 * Membership is stored as `WordSet.entryIds` and nothing on the entry side
 * points back, so every screen that shows a set has to resolve the ids against
 * the notebook it already has in memory. That resolution is the whole of this
 * module, and it is pure so the pages above it stay about buttons.
 */

/**
 * The words in a set, in the order the set stores them.
 *
 * **An id with no entry behind it is dropped rather than rendered blank.**
 * Deleting a word does not visit the sets that named it — that would be one
 * write per set for a delete that has nothing to do with them — so a set can
 * outlive its members. Resolving through the notebook is what makes that
 * harmless: the row disappears, and the count derived from this list agrees
 * with what is on screen. `entryIds.length` does not, which is why nothing
 * displays it.
 *
 * The stored order is the study order, so it is preserved exactly; sorting
 * here would quietly discard the one thing this array carries beyond a set.
 */
export function membersOf(set: WordSet, entries: readonly Entry[]): Entry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return set.entryIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

/** How many suggestions the add-a-word box offers at once. */
export const CANDIDATE_LIMIT = 8;

/**
 * Words matching what was typed, minus the ones already in the set.
 *
 * Excluding current members is not cosmetic: adding a word twice is a no-op
 * that looks like a broken button, and the search box is the only place the
 * two lists are visible at the same time.
 *
 * An empty query returns nothing rather than everything — this is a picker for
 * a set that may hold a handful of words out of hundreds, and an unfiltered
 * list of the whole notebook is not a suggestion.
 */
export function candidatesFor(
  set: WordSet,
  entries: readonly Entry[],
  query: string,
  limit: number = CANDIDATE_LIMIT,
): Entry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const taken = new Set(set.entryIds);
  const found: Entry[] = [];
  for (const entry of entries) {
    if (found.length === limit) break;
    if (taken.has(entry.id)) continue;
    if (
      entry.headword.toLowerCase().includes(needle) ||
      entry.reading.toLowerCase().includes(needle)
    ) {
      found.push(entry);
    }
  }
  return found;
}

/**
 * Appended, not prepended, and never twice.
 *
 * New words joining at the end keeps the study order the set was built in.
 */
export function withMember(entryIds: readonly string[], entryId: string): string[] {
  return entryIds.includes(entryId) ? [...entryIds] : [...entryIds, entryId];
}

export function withoutMember(entryIds: readonly string[], entryId: string): string[] {
  return entryIds.filter((id) => id !== entryId);
}

/**
 * The writable half of a set.
 *
 * Written out field by field rather than by destructuring the rest, so that a
 * new field on `WordSet` fails to compile here instead of silently never being
 * written back — an edit would then reset it to whatever the form left out.
 */
export function toDraft(set: WordSet): WordSetDraft {
  return {
    name: set.name,
    description: set.description,
    entryIds: set.entryIds,
    level: set.level,
    topics: set.topics,
  };
}
