import { Ruby } from '@/components/Ruby';
import { VocabLink } from '@/components/VocabLink';
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
  onRemoveAll,
  onMoveBy,
}: {
  members: readonly Entry[];
  /** This list's name in the drag protocol; see `useListDrag`. */
  list: string;
  drag: ListDrag;
  /**
   * True while a write is in flight. It gates the rows as well as the buttons:
   * `applyOrder` refuses a write during one, so an ungated row would let a drag
   * run its whole course — ghost, drop indicator, release — and then decline it
   * silently. The affordances have to agree with the guard.
   */
  busy: boolean;
  onRemove: (entryId: string) => void;
  /** Asks; it does not do it. The route confirms first — see `WordSetDetail`. */
  onRemoveAll: (entryIds: string[]) => void;
  onMoveBy: (index: number, delta: number) => void;
}) {
  const at = drag.at?.list === list ? drag.at.index : null;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-card bg-card shadow-panel">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="text-sm font-semibold">
          収録語
          <span className="ml-2 text-xs font-normal text-muted tabular-nums">
            {members.length} 語
          </span>
        </h2>
        {/* Mirrors 表示中の N 語を追加 across the gap, and names its own count
            for the same reason: it acts on the rows in view, not on `entryIds`,
            so a member whose word has been deleted is not among them. */}
        <button
          type="button"
          onClick={() => onRemoveAll(members.map((entry) => entry.id))}
          disabled={busy || members.length === 0}
          className="min-h-9 rounded-pill bg-danger-soft px-4 text-xs font-semibold text-danger disabled:opacity-60"
        >
          表示中の {members.length} 語を削除
        </button>
      </div>

      <ul
        data-drop-list={list}
        data-drop-count={members.length}
        /**
         * Says out loud whether this list can take what is being dragged, and
         * whether it is about to.
         *
         * Not decoration: 単語を探す is a drag *source* and refuses drops, so
         * without something marking the one list that accepts them, releasing
         * over the wrong panel simply does nothing and looks like the feature
         * is broken. `over` is the stronger state of the same claim.
         */
        data-drop-state={drag.dragging === null ? 'idle' : at === null ? 'ready' : 'over'}
        className="min-h-0 flex-1 overflow-y-auto rounded-panel px-4 py-2 outline-2 outline-offset-[-4px] outline-transparent transition-colors data-[drop-state=over]:bg-accent-soft/40 data-[drop-state=over]:outline-accent data-[drop-state=ready]:outline-line data-[drop-state=ready]:outline-dashed"
      >
        {members.map((entry, index) => (
          <li
            key={entry.id}
            data-drop-index={index}
            {...(busy ? {} : drag.rowProps({ list, id: entry.id, index }))}
            /**
             * `touch-pan-y`, not `touch-none`: a finger on a row scrolls the
             * panel, because a bounded panel whose rows cannot be scrolled from
             * is a panel that cannot be read. Touch drags start from the grip,
             * which is the only element here that claims the gesture.
             */
            className={`group flex cursor-grab touch-pan-y items-center gap-2 rounded-panel border-y-2 border-transparent py-1.5 select-none hover:bg-bg-alt ${
              at === index ? 'border-t-accent' : ''
            } ${at === members.length && index === members.length - 1 ? 'border-b-accent' : ''} ${
              drag.dragging?.list === list && drag.dragging.id === entry.id
                ? 'cursor-grabbing opacity-40'
                : ''
            }`}
          >
            <DragHandle
              label={entry.headword}
              disabled={busy}
              onPointerDown={drag.handleProps({ list, id: entry.id, index }).onPointerDown}
              onMoveBy={(delta) => onMoveBy(index, delta)}
            />
            <VocabLink
              entryId={entry.id}
              // `cursor-grab` overrides the pointer an anchor gets by default:
              // the row is draggable along its whole width, and a hand that
              // changes shape halfway across it says the opposite.
              className="min-w-0 flex-1 cursor-grab truncate select-none"
            >
              <Ruby
                headword={entry.headword}
                reading={entry.reading}
                className="has-ruby font-display text-base font-bold"
              />
            </VocabLink>
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
