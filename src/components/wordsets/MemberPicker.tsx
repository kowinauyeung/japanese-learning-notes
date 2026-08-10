import type { Entry } from '@/domain/entry';
import type { ListDrag } from '@/lib/listDrag';
import { CANDIDATE_LIMIT } from '@/lib/wordSetMembers';
import { DragHandle } from './DragHandle';

/**
 * 単語を探す — the notebook, minus what the set already holds.
 *
 * The narrowing happens in `PickerToolbar` above and arrives here as a list;
 * this panel is the drag source and nothing else. Its own scroll is what keeps
 * it beside 収録語 instead of pushing it off the screen.
 */
export function MemberPicker({
  shown,
  total,
  list,
  drag,
  busy,
  onAdd,
  onAddAll,
}: {
  shown: readonly Entry[];
  /** Everything that matched, which is usually more than is rendered. */
  total: number;
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
  onAdd: (entryId: string) => void;
  onAddAll: (entryIds: string[]) => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-card bg-card shadow-panel">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="text-sm font-semibold">
          単語を探す
          <span className="ml-2 text-xs font-normal text-muted tabular-nums">
            {total} 語{total > CANDIDATE_LIMIT && `（上位 ${CANDIDATE_LIMIT} 件）`}
          </span>
        </h2>
        {/* Named with its own count, because the rendered rows are capped and
            "all" would otherwise be read as all of `total`. */}
        <button
          type="button"
          onClick={() => onAddAll(shown.map((entry) => entry.id))}
          disabled={busy || shown.length === 0}
          className="min-h-9 rounded-pill bg-accent-soft px-4 text-xs font-semibold text-accent disabled:opacity-60"
        >
          表示中の {shown.length} 語を追加
        </button>
      </div>

      <ul
        data-drop-list={list}
        data-drop-count={shown.length}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
      >
        {shown.map((entry, index) => (
          <li
            key={entry.id}
            data-drop-index={index}
            {...drag.rowProps({ list, id: entry.id, index })}
            className={`flex touch-pan-y items-center gap-2 border-y-2 border-transparent py-1.5 ${
              drag.dragging?.list === list && drag.dragging.id === entry.id ? 'opacity-40' : ''
            }`}
          >
            <DragHandle
              label={entry.headword}
              disabled={busy}
              onPointerDown={drag.handleProps({ list, id: entry.id, index }).onPointerDown}
              // This list has no order of its own to change — it is sorted by
              // the toolbar above — so the arrows would move a row back to where
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

        {shown.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">条件に合う単語がありません</li>
        )}
      </ul>
    </section>
  );
}
