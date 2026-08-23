import type { Entry } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
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
   *
   * It gates the rows too, not only the buttons: an ungated row would let a
   * drag run its whole course and then have `applyOrder` decline it silently.
   */
  busy: boolean;
  onAdd: (entryId: string) => void;
  onAddAll: (entryIds: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-card bg-card shadow-panel">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="text-sm font-semibold">
          {t('wordSets.findWords')}
          <span className="ml-2 text-xs font-normal text-muted tabular-nums">
            {total > CANDIDATE_LIMIT
              ? t('wordSets.limitedCount', { count: total, limit: CANDIDATE_LIMIT })
              : t('wordSets.count', { count: total })}
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
          {t('wordSets.addShown', { count: shown.length })}
        </button>
      </div>

      <ul
        data-drop-list={list}
        data-drop-count={shown.length}
        // No `data-drop-state`: this list is a source and refuses drops, so it
        // must not offer the outline that says otherwise. See `MemberList`.
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
      >
        {shown.map((entry, index) => (
          <li
            key={entry.id}
            data-drop-index={index}
            {...(busy ? {} : drag.rowProps({ list, id: entry.id, index }))}
            className={`group flex cursor-grab touch-pan-y items-center gap-2 rounded-panel border-y-2 border-transparent py-1.5 select-none hover:bg-bg-alt ${
              drag.dragging?.list === list && drag.dragging.id === entry.id
                ? 'cursor-grabbing opacity-40'
                : ''
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
              {t('wordSets.add')}
            </button>
          </li>
        ))}

        {shown.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">{t('vocabulary.noResults')}</li>
        )}
      </ul>
    </section>
  );
}
