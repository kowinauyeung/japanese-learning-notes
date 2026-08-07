import { Link } from 'react-router-dom';
import type { Entry } from '@/types/entry';
import { Ruby } from '@/components/Ruby';
import { LogoMark } from '@/components/Logo';

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

/**
 * The one card on the dashboard meant to be looked at rather than scanned, so
 * it gets treatment the sibling panels do not: a tinted gradient, an oversized
 * headword, and the logomark bled off the corner as a watermark.
 */
export function TodayWord({ entry }: { entry: Entry }) {
  const summary = entry.senses[0]?.description || entry.definition;

  return (
    <Link
      to={`/vocabulary/${entry.id}`}
      className="rounded-card border-line from-accent-soft to-card shadow-panel relative block overflow-hidden border bg-linear-to-br p-5 transition hover:-translate-y-0.5"
    >
      {/* Decorative, and already announced by the heading below. */}
      <LogoMark className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 opacity-[0.06]" />

      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="text-accent text-xs font-semibold tracking-wide">📅 今日の単語</p>
          <span className="rounded-pill bg-card/70 text-accent shrink-0 px-2 py-0.5 text-[11px] font-semibold">
            {entry.jlpt}
          </span>
        </div>

        <Ruby
          headword={entry.headword}
          reading={entry.reading}
          className="font-display has-ruby mt-3 block text-4xl font-bold"
        />

        {summary && <p className="prose-cjk mt-2 line-clamp-2 text-sm">{summary}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {entry.pos.slice(0, 2).map((part) => (
            <span
              key={part}
              className="bg-card/70 text-muted rounded-pill px-2 py-0.5 text-[11px]"
            >
              {part}
            </span>
          ))}
          {entry.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-accent rounded-pill px-1 text-[11px]">
              #{tag}
            </span>
          ))}
          <span className="text-accent ml-auto text-xs font-semibold">詳しく見る →</span>
        </div>
      </div>
    </Link>
  );
}
