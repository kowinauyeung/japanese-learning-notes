import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useListDrag } from '@/lib/listDrag';
import type { DragSource, DropAt } from '@/lib/listDrag';

/**
 * The drag hook's one behaviour that a browser cannot show: what happens when a
 * release is handled before React has flushed the state the move set.
 *
 * `pointermove` is not a discrete event, so the update it schedules may still be
 * pending when the `pointerup` after it arrives — and the window listener in
 * flight was captured with the *previous* value. Reproducing that needs both
 * events inside one `act`, which is the one place a test has an advantage over
 * a real pointer: Playwright cannot hold React's scheduler still.
 */

/** A minimal consumer of the hook: one list, one row. */
function Harness({ onDrop }: { onDrop: (source: DragSource, at: DropAt) => void }) {
  const drag = useListDrag(onDrop);
  return (
    <ul data-drop-list="rows" data-drop-count={1}>
      <li data-drop-index={0} {...drag.rowProps({ list: 'rows', id: 'x', index: 0 })}>
        row
      </li>
    </ul>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useListDrag — a release that beats the render', () => {
  it('commits the drop instead of discarding it', () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const row = screen.getByText('row');

    // jsdom has no layout and does not implement elementFromPoint at all, so
    // the hit test has nothing to find. Standing in for the browser's own API,
    // not for anything of ours.
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => row,
    });
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 40,
      bottom: 40,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Arming writes refs only, so no render happens here.
    fireEvent.pointerDown(row, { clientX: 10, clientY: 10 });

    // Both in one act: the move schedules `dragging`, and the release is
    // handled before that update can reach the listener.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 30 }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    });

    expect(onDrop).toHaveBeenCalledWith(
      { list: 'rows', id: 'x', index: 0 },
      { list: 'rows', index: 1 },
    );
  });
});
