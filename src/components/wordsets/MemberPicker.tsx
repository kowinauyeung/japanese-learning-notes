import { useMemo, useState } from 'react';
import type { Entry } from '@/domain/entry';
import type { WordSet } from '@/domain/wordSet';
import { candidatesFor } from '@/lib/wordSetMembers';

/**
 * Add a word already in the notebook to this set.
 *
 * The search is over the entries the provider has in memory, so it answers as
 * fast as it is typed and needs no query. Words already in the set are not
 * offered — see `candidatesFor`.
 */
export function MemberPicker({
  set,
  entries,
  busy,
  onAdd,
}: {
  set: WordSet;
  entries: readonly Entry[];
  /**
   * True while a write is in flight. Every ＋追加 is disabled together, not
   * just the one that was pressed: each write sends the whole `entryIds` array
   * built from the set in hand, so a second press before the first has been
   * read back would send a list that never contained the first word.
   */
  busy: boolean;
  onAdd: (entryId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => candidatesFor(set, entries, query), [set, entries, query]);
  const searching = query.trim().length > 0;

  return (
    <section className="space-y-3 rounded-card bg-card p-5 shadow-panel">
      <h2 className="text-sm font-semibold">既存の単語を追加</h2>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="見出し語・読み方で検索"
        className="min-h-11 w-full rounded-pill border border-line bg-bg px-4 text-sm text-ink placeholder:text-muted"
      />

      {searching &&
        (candidates.length > 0 ? (
          <ul className="divide-y divide-line">
            {candidates.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-display font-bold">{entry.headword}</span>
                  {entry.reading && <span className="text-muted">（{entry.reading}）</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(entry.id)}
                  disabled={busy}
                  className="min-h-9 shrink-0 rounded-pill bg-accent-soft px-4 text-xs font-semibold text-accent disabled:opacity-60"
                >
                  ＋ 追加
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted">追加できる単語が見つかりません</p>
        ))}
    </section>
  );
}
