import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * The grip on a draggable row — and the keyboard's way to do the same thing.
 *
 * A real `<button>` rather than a styled `<span>`, because the arrow keys are
 * the only way to reorder without a pointer and they need something focusable
 * to hang off. That is also why `onMoveBy` is required rather than optional: a
 * grip that can only be dragged is a control half the people using this app
 * cannot operate.
 *
 * `touch-action: none` is what makes it work on a phone at all. Without it the
 * browser claims the gesture for scrolling as soon as the finger moves, and the
 * drag never receives a second pointer event.
 */
export function DragHandle({
  label,
  disabled,
  onPointerDown,
  onMoveBy,
}: {
  /** Names the row, so the control reads as 「兆候を並び替え」 rather than 「並び替え」. */
  label: string;
  disabled: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
  /** Called with -1 or 1 when the arrow keys move the row. Null where the list has no order to change. */
  onMoveBy: ((delta: number) => void) | null;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}を並び替え`}
      /**
       * `aria-disabled`, not `disabled`. A disabled button drops focus, and
       * every arrow press writes — so the real `disabled` would throw the
       * keyboard out of the list after each single step and make the one path
       * that exists without a pointer unusable. The guards below refuse the
       * gesture instead, which is the same answer without the eviction.
       */
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) return;
        onPointerDown(event);
      }}
      onKeyDown={(event) => {
        if (disabled || !onMoveBy) return;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        // Otherwise the page scrolls out from under the row being moved.
        event.preventDefault();
        onMoveBy(event.key === 'ArrowUp' ? -1 : 1);
      }}
      // 44px square: on touch this is the only way into a drag, because a row
      // that claimed the gesture could no longer scroll the panel it sits in.
      // Half-visible until the row is pointed at, then full. Present enough to
      // be found, quiet enough that a list of twenty does not read as a column
      // of dots — and the row it belongs to is what makes it come forward, so
      // the grip is what teaches that the row itself is draggable.
      className="grid h-11 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-panel text-muted opacity-50 transition select-none group-hover:opacity-100 hover:bg-bg-alt hover:text-ink focus-visible:opacity-100 active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-30"
    >
      ⠿
    </button>
  );
}
