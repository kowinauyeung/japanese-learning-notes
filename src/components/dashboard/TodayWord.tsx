import { Link } from 'react-router-dom';
import type { Entry } from '../../types/entry';
import { Ruby } from '../Ruby';

/**
 * Same word all day, a different one tomorrow, with nothing persisted: the
 * date string alone decides the pick.
 */
export function pickWordOfDay(entries: Entry[], todayKey: string): Entry | null {
  if (!entries.length) return null;
  let hash = 0;
  for (const char of todayKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[hash % ordered.length];
}

export function TodayWord({ entry }: { entry: Entry }) {
  return (
    <Link
      to={`/vocabulary/${entry.id}`}
      className="rounded-card bg-accent-soft block p-5 transition hover:brightness-[0.98]"
    >
      <p className="text-accent text-xs font-semibold">📅 今日の単語</p>
      <Ruby
        headword={entry.headword}
        reading={entry.reading}
        className="font-display mt-2 block text-3xl font-bold"
      />
      <p className="prose-cjk mt-2 text-sm">
        {entry.senses[0]?.description || entry.definitionJa}
      </p>
    </Link>
  );
}
