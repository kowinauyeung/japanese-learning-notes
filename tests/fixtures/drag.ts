import type { ListDrag } from '@/lib/listDrag';

/**
 * A drag that is not happening.
 *
 * The gesture itself is only observable in a browser — it is a pointer driving
 * a hit test over a live layout — so the component tests take this and assert
 * on the buttons and the keyboard instead. See `tests/e2e/wordsets.spec.ts`
 * for the drag.
 */
export const idleDrag: ListDrag = {
  dragging: null,
  at: null,
  point: null,
  handleProps: () => ({ onPointerDown: () => {} }),
  rowProps: () => ({ onPointerDown: () => {} }),
};
