import { Link } from 'react-router-dom';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';
import type { ListDrag } from '@/lib/listDrag';
import { DragHandle } from './DragHandle';

/**
 * 収録語 — the set's words, in the order it stores them.
 *
 * That order is the study order, and until this list could be dragged there was
 * no way to change it: words joined at the end and stayed there. It is why the
 * rows carry a grip and the picker's rows carry one too.
 *
 * `border-y-2 border-transparent` is on every row rather than only the one
 * being dropped onto. A border added on hover would grow the row by 4px, move
 * every row below it, and hand the pointer a different target than the one the
 * indicator was drawn for — the drop then lands a row away from where it looked.
 */
export function MemberList({
  members,
  list,
  drag,
  busy,
  onRemove,
  onMoveBy,
}: {
  members: readonly Entry[];
  /** This list's name in the drag protocol; see `useListDrag`. */
  list: string;
  drag: ListDrag;
  busy: boolean;
  onRemove: (entryId: string) => void;
  onMoveBy: (index: number, delta: number) => void;
}) {
  const at = drag.at?.list === list ? drag.at.index : null;

  return (
    <section className="space-y-2 rounded-card bg-card p-5 shadow-panel">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">収録語</h2>
        <p className="text-xs text-muted tabular-nums">{members.length} 語</p>
      </div>

      <ul data-drop-list={list} data-drop-count={members.length} className="min-h-16">
        {members.map((entry, index) => (
          <li
            key={entry.id}
            data-drop-index={index}
            className={`flex items-center gap-2 border-y-2 border-transparent py-1.5 ${
              at === index ? 'border-t-accent' : ''
            } ${at === members.length && index === members.length - 1 ? 'border-b-accent' : ''} ${
              drag.dragging?.list === list && drag.dragging.id === entry.id ? 'opacity-40' : ''
            }`}
          >
            <DragHandle
              label={entry.headword}
              disabled={busy}
              onPointerDown={drag.handleProps({ list, id: entry.id, index }).onPointerDown}
              onMoveBy={(delta) => onMoveBy(index, delta)}
            />
            <Link to={`/vocabulary/${entry.id}`} className="min-w-0 flex-1 truncate">
              <Ruby
                headword={entry.headword}
                reading={entry.reading}
                className="has-ruby font-display text-base font-bold"
              />
            </Link>
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              disabled={busy}
              className="min-h-9 shrink-0 rounded-pill bg-danger-soft px-4 text-xs font-semibold text-danger disabled:opacity-60"
            >
              削除
            </button>
          </li>
        ))}

        {members.length === 0 && (
          <li
            className={`grid min-h-16 place-items-center rounded-panel border-2 border-dashed text-sm text-muted ${
              at === 0 ? 'border-accent text-accent' : 'border-line'
            }`}
          >
            下の一覧からドラッグ、または「＋ 追加」で入れてください
          </li>
        )}
      </ul>
    </section>
  );
}
