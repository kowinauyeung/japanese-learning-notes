import type { Entry } from '@/domain/entry';

/** Unique tags from the most recently created entries, newest first. */
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
