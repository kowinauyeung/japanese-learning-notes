import { Link } from 'react-router-dom';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';

export function EntryRow({ entry }: { entry: Entry }) {
  return (
    <Link
      to={`/vocabulary/${entry.id}`}
      className="flex items-center gap-3 rounded-panel px-3 py-2.5 transition hover:bg-bg-alt"
    >
      <Ruby
        headword={entry.headword}
        reading={entry.reading}
        className="has-ruby font-display text-base font-bold"
      />
      <span className="prose-cjk flex-1 truncate text-sm text-muted">
        {entry.senses[0]?.description || entry.definition}
      </span>
      <span className="shrink-0 text-xs text-muted tabular-nums">{entry.learnedOn}</span>
    </Link>
  );
}
