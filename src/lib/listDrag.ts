import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Dragging a row from one list into another, or within one.
 *
 * Pointer events rather than HTML5 drag-and-drop, for one reason that decides
 * it: `dragstart` never fires on a touchscreen. This app is laid out for phones
 * first, so a gesture that only exists on a mouse would be a feature half the
 * sessions cannot see. Pointer events are one API over mouse, touch and pen.
 *
 * It is deliberately not a general drag-and-drop library. It knows about lists
 * of rows and insertion points between them, which is the only shape used here,
 * and it leaves the keyboard path to the caller — a drag handle that is a real
 * `<button>` with arrow keys is more use to a screen reader than any amount of
 * `aria-grabbed`.
 */

export interface DragSource {
  /** Which list the row came from, so a drop can tell add from reorder. */
  list: string;
  id: string;
  index: number;
}

export interface DropAt {
  list: string;
  /** Insertion point: the gap *before* this row. */
  index: number;
}

/**
 * Which gap a pointer at `clientY` is nearest, given the row it is over.
 *
 * The midpoint, not the edge: dropping "on" a row is meaningless for a list
 * that stores an order, and every row would otherwise have a dead zone in it
 * where nothing happens at all.
 */
export function dropIndexFor(index: number, top: number, height: number, clientY: number): number {
  return clientY < top + height / 2 ? index : index + 1;
}

/**
 * Hit-test a point against the marked-up lists.
 *
 * Reads the DOM rather than tracking rectangles in state, because the two lists
 * resize as rows move between them and a cached layout is wrong from the first
 * frame of the drag onwards.
 */
function targetAt(x: number, y: number): DropAt | null {
  const element = document.elementFromPoint(x, y);
  if (!(element instanceof Element)) return null;

  const row = element.closest<HTMLElement>('[data-drop-index]');
  if (row) {
    const list = row.closest<HTMLElement>('[data-drop-list]')?.dataset.dropList;
    const index = Number(row.dataset.dropIndex);
    if (list === undefined || !Number.isInteger(index)) return null;
    const rect = row.getBoundingClientRect();
    return { list, index: dropIndexFor(index, rect.top, rect.height, y) };
  }

  // The container itself, which is what an empty list — or the padding below
  // the last row — has to accept, or a set with no words in it could never
  // receive its first one.
  const container = element.closest<HTMLElement>('[data-drop-list]');
  const list = container?.dataset.dropList;
  if (list === undefined) return null;
  return { list, index: Number(container?.dataset.dropCount ?? 0) };
}

export interface ListDrag {
  dragging: DragSource | null;
  at: DropAt | null;
  /** Where to draw the thing following the finger. Null when not dragging. */
  point: { x: number; y: number } | null;
  handleProps: (source: DragSource) => {
    onPointerDown: (event: ReactPointerEvent) => void;
  };
}

export function useListDrag(onDrop: (source: DragSource, at: DropAt) => void): ListDrag {
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [at, setAt] = useState<DropAt | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  /**
   * The last target, read by `pointerup`.
   *
   * A ref rather than the state above, because `pointerup` and the final
   * `pointermove` arrive in the same task on a fast flick: the state setter has
   * not been applied yet when the release is handled, and the drop would land
   * on the target from two moves ago.
   */
  const target = useRef<DropAt | null>(null);

  /**
   * The drop handler, held by reference.
   *
   * It closes over the current order, so the caller rebuilds it every render —
   * and the listeners below must not be torn down and re-attached on each of
   * the sixty renders a second a drag produces. Reading it through a ref keeps
   * the subscription tied to the gesture rather than to the render.
   */
  const handler = useRef(onDrop);
  useEffect(() => {
    handler.current = onDrop;
  });

  const handleProps = useCallback(
    (source: DragSource) => ({
      onPointerDown: (event: ReactPointerEvent) => {
        // Left button only; touch and pen report 0 here as well.
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Stops the browser starting a text selection that then fights the drag.
        event.preventDefault();
        target.current = null;
        setDragging(source);
        setAt(null);
        setPoint({ x: event.clientX, y: event.clientY });
      },
    }),
    [],
  );

  useEffect(() => {
    if (!dragging) return;

    const stop = () => {
      setDragging(null);
      setAt(null);
      setPoint(null);
    };

    const move = (event: PointerEvent) => {
      setPoint({ x: event.clientX, y: event.clientY });
      const next = targetAt(event.clientX, event.clientY);
      target.current = next;
      setAt(next);
    };

    const up = () => {
      const dropped = target.current;
      target.current = null;
      stop();
      if (dropped) handler.current(dragging, dropped);
    };

    const abandon = () => {
      target.current = null;
      stop();
    };

    // Escape abandons the drag: the only way out once a finger is down, and the
    // one every other drag on the platform offers.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') abandon();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abandon);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abandon);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dragging]);

  return { dragging, at, point, handleProps };
}
