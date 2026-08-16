import { LogoMark } from '@/components/Logo';
import { Ruby } from '@/components/Ruby';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';

/**
 * Same word all day, a different one tomorrow, with nothing persisted: the
 * date string alone decides the pick.
 */
export function pickWordOfDay(entries: Entry[], todayKey: string): Entry | null {
  if (!entries.length) return null;
  let hash = 0;
  for (const char of todayKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[hash % ordered.length] ?? null;
}

/**
 * The one card on the dashboard meant to be looked at rather than scanned, so
 * it gets treatment the sibling panels do not: a tinted gradient, an oversized
 * headword, and the logomark bled off the corner as a watermark.
 */
export function TodayWord({ entry }: { entry: Entry }) {
  const summary = entry.senses[0]?.description || entry.definition;

  return (
    <VocabLink
      entryId={entry.id}
      className="relative block overflow-hidden rounded-card border border-line bg-linear-to-br from-accent-soft to-card p-5 shadow-panel transition hover:-translate-y-0.5"
    >
      {/* Decorative, and already announced by the heading below. */}
      <LogoMark className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 opacity-[0.06]" />

      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-accent">📅 今日の単語</p>
          <span className="shrink-0 rounded-pill bg-card/70 px-2 py-0.5 text-[11px] font-semibold text-accent">
            {entry.jlpt}
          </span>
        </div>

        <Ruby
          headword={entry.headword}
          reading={entry.reading}
          className="has-ruby mt-3 block font-display text-4xl font-bold"
        />

        {summary && <p className="prose-cjk mt-2 line-clamp-2 text-sm">{summary}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {entry.pos.slice(0, 2).map((part) => (
            <span key={part} className="rounded-pill bg-card/70 px-2 py-0.5 text-[11px] text-muted">
              {part}
            </span>
          ))}
          {entry.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-pill px-1 text-[11px] text-accent">
              #{tag}
            </span>
          ))}
          <span className="ml-auto text-xs font-semibold text-accent">詳しく見る →</span>
        </div>
      </div>
    </VocabLink>
  );
}
