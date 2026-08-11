import type { Entry } from '@/domain/entry';
import type { WordSet, WordSetDraft } from '@/domain/wordSet';
import { matches, sortEntries } from '@/lib/filters';
import type { Filters } from '@/lib/filters';

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

/**
 * How many candidates the picker renders at once.
 *
 * A cap rather than a page, because the list is a drag source: reaching row
 * 200 means scrolling the drop target off screen mid-gesture. The count of
 * everything that matched is shown beside it, so a number larger than this is
 * a prompt to narrow the filters rather than to scroll.
 */
export const CANDIDATE_LIMIT = 50;

/**
 * Words that could join the set, narrowed the same way 一覧 narrows the
 * notebook, minus the ones already in it.
 *
 * Excluding current members is not cosmetic: adding a word twice is a no-op
 * that looks like a broken button, and this is the one screen where both lists
 * are visible at once.
 *
 * With no filters set this is the whole notebook, newest first — `EMPTY_FILTERS`
 * sorts by 追加日（新しい順）, so the words most likely to be filed into a set
 * are the ones already on screen before anything is typed.
 */
export function candidatesFor(
  set: WordSet,
  entries: readonly Entry[],
  filters: Filters,
  limit: number = CANDIDATE_LIMIT,
): { shown: Entry[]; total: number } {
  const taken = new Set(set.entryIds);
  const found = sortEntries(
    entries.filter((entry) => !taken.has(entry.id) && matches(entry, filters)),
    filters.sort,
  );
  return { shown: found.slice(0, limit), total: found.length };
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
 * Drop several at once — the ones a screen was showing, and only those.
 *
 * Not "empty the set": an id whose word has been deleted is not on that screen,
 * so it is not among the ids handed in, and it stays. Clearing it as well would
 * be this control quietly doing something nobody asked it to.
 */
export function withoutMembers(
  entryIds: readonly string[],
  entryIdsToDrop: readonly string[],
): string[] {
  const dropping = new Set(entryIdsToDrop);
  return entryIds.filter((id) => !dropping.has(id));
}

/**
 * Where a row on screen sits in the stored array.
 *
 * The two are not the same list. `membersOf` drops an id whose word has been
 * deleted, so 収録語 can be shorter than `entryIds`, and every position after
 * the missing one is off by one. Handing a visible index straight to
 * `reorderMembers` then moves whichever id happens to occupy that slot — often
 * the stale one, which changes nothing on screen and still costs a write, so
 * the gesture reads as broken rather than as refused.
 *
 * Two edges are deliberate. A visible index past the last row is the trailing
 * gap and answers `entryIds.length`, which is where an append belongs. A
 * negative one is passed through rather than clamped, because that is how
 * ArrowUp on the first row says "before everything", and `reorderMembers` is
 * what decides that means stay put.
 */
export function storedIndexFor(
  entryIds: readonly string[],
  visibleIds: readonly string[],
  visible: number,
): number {
  if (visible < 0) return -1;

  const id = visibleIds[visible];
  if (id === undefined) return entryIds.length;

  const found = entryIds.indexOf(id);
  return found === -1 ? entryIds.length : found;
}

/**
 * Move the member at `from` so that it lands at insertion point `to`.
 *
 * `to` is an insertion index in the *original* array's coordinates — the gap
 * before row `to` — which is what a drop indicator between two rows actually
 * means. Removing the item first shifts everything after it down by one, so a
 * downward move has to lose one to land where the indicator was drawn; without
 * that correction every drag downwards stops one row short of where it was
 * released, which reads as the feature being broken rather than off by one.
 */
export function reorderMembers(entryIds: readonly string[], from: number, to: number): string[] {
  const next = [...entryIds];

  // An index past the end takes nothing out, which is the answer for a stale
  // row index arriving after a refresh has shortened the list.
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...entryIds];

  // Clamped at the bottom only. `splice` already clamps a high index, but a
  // negative one counts back from the end — and ArrowUp on the first row asks
  // for gap -1, which would then put it second instead of leaving it alone.
  const target = Math.max(0, to);
  next.splice(target > from ? target - 1 : target, 0, moved);
  return next;
}

/**
 * Put a word at a given insertion point, whether or not the set already holds it.
 *
 * Dragging a member onto a new position and dragging an outside word in are the
 * same gesture, and the drop target cannot tell which it was handed — so this
 * moves an existing member rather than inserting a duplicate.
 */
export function insertMemberAt(
  entryIds: readonly string[],
  entryId: string,
  index: number,
): string[] {
  const existing = entryIds.indexOf(entryId);
  if (existing !== -1) return reorderMembers(entryIds, existing, index);

  const next = [...entryIds];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, entryId);
  return next;
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
