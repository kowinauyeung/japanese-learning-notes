import { Link } from 'react-router-dom';
import type { Entry } from '@/types/entry';
import { Ruby } from '@/components/Ruby';

export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <Link
      to={`/vocabulary/${entry.id}`}
      className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-panel transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <Ruby
          headword={entry.headword}
          reading={entry.reading}
          className="has-ruby font-display text-xl font-bold"
        />
        <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
          {entry.jlpt}
        </span>
      </div>

      <p className="prose-cjk line-clamp-2 text-sm text-muted">
        {entry.senses[0]?.description || entry.definition}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {entry.pos.slice(0, 2).map((part) => (
          <span key={part} className="rounded-pill bg-bg-alt px-2 py-0.5 text-[11px] text-muted">
            {part}
          </span>
        ))}
        {entry.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-pill px-1 text-[11px] text-accent">
            #{tag}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-muted tabular-nums">{entry.learnedOn}</span>
      </div>
    </Link>
  );
}
