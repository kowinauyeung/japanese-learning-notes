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
    <section className="flex min-h-0 flex-1 flex-col rounded-card bg-card shadow-panel">
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-line p-4">
        <h2 className="text-sm font-semibold">収録語</h2>
        <p className="text-xs text-muted tabular-nums">{members.length} 語</p>
      </div>

      <ul
        data-drop-list={list}
        data-drop-count={members.length}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
      >
        {members.map((entry, index) => (
          <li
            key={entry.id}
            data-drop-index={index}
            {...drag.rowProps({ list, id: entry.id, index })}
            /**
             * `touch-pan-y`, not `touch-none`: a finger on a row scrolls the
             * panel, because a bounded panel whose rows cannot be scrolled from
             * is a panel that cannot be read. Touch drags start from the grip,
             * which is the only element here that claims the gesture.
             */
            className={`flex touch-pan-y items-center gap-2 border-y-2 border-transparent py-1.5 ${
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
            <Link
              to={`/vocabulary/${entry.id}`}
              /**
               * An `<a>` is natively draggable, and the row body is now a drag
               * source. Left alone, a press that drifts even a few pixels
               * starts the browser's own link drag instead — which cancels the
               * click, so the word cannot be opened, and fights our pointer
               * drag for the gesture.
               */
              draggable={false}
              className="min-w-0 flex-1 truncate select-none"
            >
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
            className={`grid min-h-24 place-items-center rounded-panel border-2 border-dashed px-3 text-center text-sm text-muted ${
              at === 0 ? 'border-accent text-accent' : 'border-line'
            }`}
          >
            ここに単語をドラッグ、または「＋ 追加」で入れてください
          </li>
        )}
      </ul>
    </section>
  );
}
