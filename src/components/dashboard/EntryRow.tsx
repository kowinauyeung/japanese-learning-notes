import { Link } from 'react-router-dom';
import type { Entry } from '../../types/entry';
import { Ruby } from '../Ruby';

export function EntryRow({ entry }: { entry: Entry }) {
  return (
    <Link
      to={`/vocabulary/${entry.id}`}
      className="hover:bg-bg-alt rounded-panel flex items-center gap-3 px-3 py-2.5 transition"
    >
      <Ruby
        headword={entry.headword}
        reading={entry.reading}
        className="font-display text-base font-bold"
      />
      <span className="text-muted prose-cjk flex-1 truncate text-sm">
        {entry.senses[0]?.description || entry.definitionJa}
      </span>
      <span className="text-muted shrink-0 text-xs tabular-nums">{entry.learnedOn}</span>
    </Link>
  );
}
