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
 * How far a pointer must travel before a press becomes a drag.
 *
 * A whole row is draggable, and a row also holds a link to the word and a
 * button that removes it. Without a threshold every click on either would begin
 * a drag, and a hand that moves two pixels between press and release would stop
 * being able to open a word at all.
 */
const PRESS_SLOP = 5;

/** How near a scroller's edge the pointer has to get, and how fast it then moves. */
const EDGE_ZONE = 56;
const EDGE_SPEED = 14;

export function beyondSlop(
  from: { x: number; y: number },
  to: { x: number; y: number },
  slop: number = PRESS_SLOP,
): boolean {
  return Math.abs(to.x - from.x) > slop || Math.abs(to.y - from.y) > slop;
}

/**
 * How far to scroll a panel this frame, given where the pointer is in it.
 *
 * Zero everywhere but the top and bottom bands, and proportional inside them,
 * so the list creeps when the pointer is near the edge and runs when it is at
 * it. Without this a bounded, scrolling panel can only receive a drop on the
 * rows that happen to be showing — the reason it is here is the same reason the
 * panels are bounded at all.
 */
export function edgeScrollFor(
  top: number,
  bottom: number,
  clientY: number,
  edge: number = EDGE_ZONE,
  speed: number = EDGE_SPEED,
): number {
  if (clientY < top + edge) {
    return -Math.ceil(speed * Math.min(1, (top + edge - clientY) / edge));
  }
  if (clientY > bottom - edge) {
    return Math.ceil(speed * Math.min(1, (clientY - (bottom - edge)) / edge));
  }
  return 0;
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

/** The nearest ancestor of the point that actually scrolls. */
function scrollerAt(x: number, y: number): HTMLElement | null {
  let node = document.elementFromPoint(x, y);
  while (node instanceof HTMLElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export interface ListDrag {
  dragging: DragSource | null;
  at: DropAt | null;
  /** Where to draw the thing following the finger. Null when not dragging. */
  point: { x: number; y: number } | null;
  /** For the grip: arms a drag from any pointer, including touch. */
  handleProps: (source: DragSource) => {
    onPointerDown: (event: ReactPointerEvent) => void;
  };
  /**
   * For the row body: arms a drag from a mouse or a pen, never from a finger.
   *
   * A touch drag needs `touch-action: none` on whatever it starts from, and a
   * whole row marked that way is a row the page can no longer be scrolled by —
   * inside a bounded panel, that is most of the panel. On touch the grip stays
   * the way in, and it is a 44px target for exactly that reason.
   */
  rowProps: (source: DragSource) => {
    onPointerDown: (event: ReactPointerEvent) => void;
  };
}

export function useListDrag(onDrop: (source: DragSource, at: DropAt) => void): ListDrag {
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [at, setAt] = useState<DropAt | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  /** A press that has not travelled far enough to be a drag yet. */
  const press = useRef<{ source: DragSource; x: number; y: number } | null>(null);
  /** The live pointer, read by the scroll loop between moves. */
  const cursor = useRef<{ x: number; y: number } | null>(null);

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
   * Whether a drag is actually running, for the same reason `target` is a ref.
   *
   * The listeners below are captured with the render's value of `dragging`, and
   * the update that sets it comes from `pointermove` — not a discrete event, so
   * React is under no obligation to have flushed it before the `pointerup` that
   * follows on a fast flick. The old listener then reads `null`, discards a drop
   * whose target the ref had recorded perfectly well, and does not arm the
   * click-swallow either. Guarding the target and leaving the gate in front of
   * it stale protects nothing.
   */
  const active = useRef<DragSource | null>(null);

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

  const arm = useCallback((source: DragSource, event: ReactPointerEvent) => {
    // Left button only; touch and pen report 0 here as well.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    press.current = { source, x: event.clientX, y: event.clientY };
    cursor.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleProps = useCallback(
    (source: DragSource) => ({
      onPointerDown: (event: ReactPointerEvent) => arm(source, event),
    }),
    [arm],
  );

  const rowProps = useCallback(
    (source: DragSource) => ({
      onPointerDown: (event: ReactPointerEvent) => {
        if (event.pointerType === 'touch') return;
        /**
         * A press that began on a control is that control's. Without this,
         * `pointerdown` on 削除 or ＋追加 bubbles here and arms a drag, so a
         * hand that drifts past the slop turns the press into a drop and the
         * click that would have removed the word is swallowed as the drag's
         * own. The failure is not "the button did nothing" — it is "the button
         * did something else". The grip is unaffected: it arms through
         * `handleProps`, on the way down, before this ever runs.
         */
        if (event.target instanceof Element && event.target.closest('button')) return;
        arm(source, event);
      },
    }),
    [arm],
  );

  // Watching a press, whether or not it has become a drag yet.
  useEffect(() => {
    const stop = () => {
      press.current = null;
      cursor.current = null;
      active.current = null;
      setDragging(null);
      setAt(null);
      setPoint(null);
    };

    const move = (event: PointerEvent) => {
      const armed = press.current;
      if (!armed) return;
      cursor.current = { x: event.clientX, y: event.clientY };

      if (!active.current) {
        if (!beyondSlop(armed, { x: event.clientX, y: event.clientY })) return;
        // Committed: the text the press started selecting is not wanted.
        document.getSelection()?.removeAllRanges();
        active.current = armed.source;
        setDragging(armed.source);
      }

      setPoint({ x: event.clientX, y: event.clientY });
      const next = targetAt(event.clientX, event.clientY);
      target.current = next;
      setAt(next);
    };

    const up = () => {
      const dragged = active.current;
      const dropped = dragged ? target.current : null;
      target.current = null;
      stop();

      if (dragged) {
        /**
         * The click that would follow this release is not a click on the row —
         * the pointer has moved across the screen since it went down — and a
         * row is a link, so left alone it would open the word just dropped.
         *
         * **Unproven, and kept anyway.** Chromium fires no click at all after
         * any drag this suite can produce, including one released on the row it
         * started from, so nothing here has ever been observed to run. It is
         * kept because the browsers the suite does not cover are not obliged to
         * agree, and because a stray navigation mid-arrangement loses the
         * screen the learner was working on. Do not treat it as tested.
         *
         * Removed on the next task rather than with `once`, so a gesture that
         * produces no click cannot leave a listener waiting to eat an
         * unrelated one.
         */
        const swallow = (click: MouseEvent) => {
          click.preventDefault();
          click.stopPropagation();
        };
        window.addEventListener('click', swallow, true);
        setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      }
      if (dragged && dropped) handler.current(dragged, dropped);
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

  /**
   * The cursor, and the text under it, for as long as the drag lasts.
   *
   * Set on `document.body` rather than on the row, because the pointer spends
   * the drag over everything *except* the row it started on — over the other
   * panel, over the gaps, over the page. A grab cursor that reverts to a text
   * caret the moment the pointer leaves the row reads as the drag having been
   * dropped. `user-select` goes with it: a pointer held down and moved is a
   * text selection to the browser, and a half-selected list is the visible
   * evidence of that fight.
   */
  useEffect(() => {
    if (!dragging) return;
    const { cursor: hadCursor, userSelect: hadSelect } = document.body.style;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = hadCursor;
      document.body.style.userSelect = hadSelect;
    };
  }, [dragging]);

  /**
   * Scrolling the panel under the pointer while a drag is held near its edge.
   *
   * A frame loop rather than work done inside `pointermove`, because a pointer
   * held still at the bottom of a list fires no more moves — and holding still
   * at the edge is exactly the gesture that means "keep going".
   */
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;

    const step = () => {
      frame = requestAnimationFrame(step);
      const point = cursor.current;
      if (!point) return;

      const scroller = scrollerAt(point.x, point.y);
      if (!scroller) return;

      const rect = scroller.getBoundingClientRect();
      const by = edgeScrollFor(rect.top, rect.bottom, point.y);
      if (by === 0) return;

      scroller.scrollTop += by;
      // The rows moved under a pointer that did not, so the target it was over
      // is stale by exactly this much.
      const next = targetAt(point.x, point.y);
      target.current = next;
      setAt(next);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  return { dragging, at, point, handleProps, rowProps };
}
