import type { Entry } from '@/domain/entry';

/**
 * Unique tags from the most recently created entries, newest first.
 *
 * **A recency-biased sample, not the notebook's full tag list, and both call
 * sites choose it deliberately.** In Browse the search box already matches on
 * tag text (`vocabulary.searchPlaceholder`), so an older tag stays reachable
 * by typing it — this list exists to make the common case a tap. In Practice
 * setup there is no search box, but scoping a session to one specific tag is
 * a narrower ask than finding one word, and a word set already exists for
 * "the exact group I want to practice". A tag used only on older entries is
 * expected to be absent from this list; that is not a bug to fix here.
 */
export function recentTags(entries: Entry[], limit = 10): string[] {
  if (limit <= 0) return [];

  const tags = new Set<string>();
  const newest = [...entries].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );

  for (const entry of newest) {
    for (const tag of entry.tags) {
      tags.add(tag);
      if (tags.size === limit) return [...tags];
    }
  }

  return [...tags];
}
