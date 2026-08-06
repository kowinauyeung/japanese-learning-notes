import { Link } from 'react-router-dom';
import type { Entry } from '../../types/entry';
import { Ruby } from '../Ruby';

export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <Link
      to={`/vocabulary/${entry.id}`}
      className="rounded-card bg-card shadow-panel flex flex-col gap-3 p-4 transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <Ruby
          headword={entry.headword}
          reading={entry.reading}
          className="font-display has-ruby text-xl font-bold"
        />
        <span className="rounded-pill bg-accent-soft text-accent shrink-0 px-2 py-0.5 text-[11px] font-semibold">
          {entry.jlpt}
        </span>
      </div>

      <p className="text-muted prose-cjk line-clamp-2 text-sm">
        {entry.senses[0]?.description || entry.definition}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {entry.pos.slice(0, 2).map((part) => (
          <span key={part} className="bg-bg-alt text-muted rounded-pill px-2 py-0.5 text-[11px]">
            {part}
          </span>
        ))}
        {entry.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="text-accent rounded-pill px-1 text-[11px]">
            #{tag}
          </span>
        ))}
        <span className="text-muted ml-auto text-[11px] tabular-nums">{entry.learnedOn}</span>
      </div>
    </Link>
  );
}
