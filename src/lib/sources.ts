import type { Entry } from '@/domain/entry';
import { ENTRY_LIMITS } from '@/domain/limits';

/**
 * Unique sources from the most recently created entries, newest first, for the
 * entry form to offer as one-tap fills.
 *
 * Derived from the notebook rather than remembered per device, so a source
 * saved on one device is offered on every other, and one whose last entry was
 * deleted stops being offered. Matching is exact after trimming: 「NHK」 and
 * 「ＮＨＫ」 stay distinct because the reader may have typed them that way on
 * purpose.
 *
 * A source longer than the form accepts is skipped: the rules allow older notes
 * a longer one, and offering it would fill the field with a value the save then
 * refuses.
 */
export function recentSources(entries: Entry[], limit = 5): string[] {
  if (limit <= 0) return [];

  const sources = new Set<string>();
  const newest = [...entries].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );

  for (const entry of newest) {
    const source = entry.source.trim();
    if (!source || source.length > ENTRY_LIMITS.source) continue;
    sources.add(source);
    if (sources.size === limit) break;
  }

  return [...sources];
}
