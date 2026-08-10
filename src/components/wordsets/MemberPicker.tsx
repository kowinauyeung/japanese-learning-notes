import { useMemo, useState } from 'react';
import { FilterPanel } from '@/components/browse/FilterPanel';
import type { Entry } from '@/domain/entry';
import type { WordSet } from '@/domain/wordSet';
import { EMPTY_FILTERS, isDefault } from '@/lib/filters';
import type { Filters } from '@/lib/filters';
import type { ListDrag } from '@/lib/listDrag';
import { candidatesFor, CANDIDATE_LIMIT } from '@/lib/wordSetMembers';
import { DragHandle } from './DragHandle';

/**
 * 単語を探す — the notebook, narrowed the way 一覧 narrows it, minus what the
 * set already holds.
 *
 * The same `FilterPanel` and the same `matches`/`sortEntries` as Browse, rather
 * than a second search box with its own rules: a word that a filter combination
 * finds on one screen has to be findable by the same combination here, and two
 * implementations of "find my word" is how that stops being true.
 *
 * Nothing is hidden until a query is typed. With no filters set this is the
 * whole notebook newest-first, because the word most likely to be filed into a
 * set is the one just added — and because a picker that starts empty gives the
 * drag gesture nothing to be discovered on.
 */
export function MemberPicker({
  set,
  entries,
  allTags,
  filters,
  list,
  drag,
  busy,
  onFiltersChange,
  onAdd,
}: {
  set: WordSet;
  entries: readonly Entry[];
  allTags: string[];
  filters: Filters;
  /** This list's name in the drag protocol; see `useListDrag`. */
  list: string;
  drag: ListDrag;
  /**
   * True while a write is in flight. Every ＋追加 and every grip is disabled
   * together, not just the one that was pressed: each write sends the whole
   * `entryIds` array built from the set in hand, so a second gesture before the
   * first has been read back would send a list that never contained the first
   * word.
   */
  busy: boolean;
  onFiltersChange: (next: Filters) => void;
  onAdd: (entryId: string) => void;
}) {
  const { shown, total } = useMemo(
    () => candidatesFor(set, entries, filters),
    [set, entries, filters],
  );

  /**
   * The panel is folded away until it is asked for, which on this screen is a
   * layout decision rather than a tidiness one: 一覧's filter panel is around
   * 200px tall, and open by default it pushes every candidate row below the
   * fold — leaving a drag whose source and target are never on screen together.
   */
  const [showFilters, setShowFilters] = useState(false);
  const narrowed = !isDefault({ ...filters, sort: EMPTY_FILTERS.sort });

  return (
    <section className="space-y-3 rounded-card bg-card p-5 shadow-panel">
      <h2 className="text-sm font-semibold">単語を探す</h2>

      <input
        type="search"
        value={filters.q}
        onChange={(event) => onFiltersChange({ ...filters, q: event.target.value })}
        placeholder="見出し語・読み方・タグ・意味・例文で検索"
        className="min-h-11 w-full rounded-pill border border-line bg-bg px-4 text-sm text-ink placeholder:text-muted"
      />

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted tabular-nums">
          {total} 語{total > CANDIDATE_LIMIT && `（上位 ${CANDIDATE_LIMIT} 件を表示）`}
        </p>
        <div className="flex items-center gap-3">
          {!isDefault(filters) && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...EMPTY_FILTERS, sort: filters.sort })}
              className="text-xs text-muted underline hover:text-ink"
            >
              すべて解除
            </button>
          )}
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((open) => !open)}
            className={`rounded-pill px-3 py-1 text-xs font-medium ${
              narrowed ? 'bg-accent-soft text-accent' : 'bg-bg-alt text-muted hover:text-ink'
            }`}
          >
            絞り込み{showFilters ? ' ▲' : ' ▼'}
          </button>
        </div>
      </div>

      {showFilters && (
        <FilterPanel filters={filters} allTags={allTags} onChange={onFiltersChange} />
      )}

      {shown.length ? (
        <ul data-drop-list={list} data-drop-count={shown.length} className="divide-y divide-line">
          {shown.map((entry, index) => (
            <li
              key={entry.id}
              data-drop-index={index}
              className={`flex items-center gap-2 py-1.5 ${
                drag.dragging?.list === list && drag.dragging.id === entry.id ? 'opacity-40' : ''
              }`}
            >
              <DragHandle
                label={entry.headword}
                disabled={busy}
                onPointerDown={drag.handleProps({ list, id: entry.id, index }).onPointerDown}
                // This list has no order of its own to change — it is sorted by
                // the panel above — so the arrows would move a row back to where
                // the sort puts it. Adding is the keyboard path here.
                onMoveBy={null}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
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
        <p className="py-4 text-sm text-muted">
          {entries.length === set.entryIds.length
            ? 'この単語集にすべての単語が入っています'
            : '条件に合う単語がありません'}
        </p>
      )}
    </section>
  );
}
