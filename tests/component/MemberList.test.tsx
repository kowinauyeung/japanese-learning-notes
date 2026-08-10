import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MemberList } from '@/components/wordsets/MemberList';
import type { ListDrag } from '@/lib/listDrag';
import { makeEntry } from '../fixtures/entry';

const MEMBERS = [
  makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ' }),
  makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう' }),
];

const idle: ListDrag = {
  dragging: null,
  at: null,
  point: null,
  handleProps: () => ({ onPointerDown: () => {} }),
};

const setup = (busy = false) => {
  const onMoveBy = vi.fn();
  // Each row links to its word, and a Link needs a router. React Router's own
  // in-memory one, not a stand-in for anything of ours.
  render(
    <MemoryRouter>
      <MemberList
        members={MEMBERS}
        list="members"
        drag={idle}
        busy={busy}
        onRemove={vi.fn()}
        onMoveBy={onMoveBy}
      />
    </MemoryRouter>,
  );
  return { onMoveBy, grip: screen.getByRole('button', { name: '兆候を並び替え' }) };
};

/**
 * The keyboard half of reordering, which is the only half that exists without a
 * pointer. A grip that can only be dragged puts the study order — the one thing
 * `entryIds` carries beyond a set — out of reach of anyone not using a mouse.
 */
describe('MemberList — reordering from the keyboard', () => {
  it('moves the row up and down with the arrow keys', () => {
    const { onMoveBy, grip } = setup();

    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });

    expect(onMoveBy.mock.calls).toEqual([
      [1, -1],
      [1, 1],
    ]);
  });

  /**
   * `aria-disabled`, not `disabled`, and this is what that distinction buys: a
   * real `disabled` drops focus the instant the write starts, so every single
   * arrow press would throw the keyboard out of the list and the row would have
   * to be found again to move it twice.
   */
  it('keeps focus on the grip while a write is in flight, and refuses the key', () => {
    const { onMoveBy, grip } = setup(true);
    grip.focus();

    fireEvent.keyDown(grip, { key: 'ArrowUp' });

    expect(onMoveBy).not.toHaveBeenCalled();
    expect(grip).toHaveFocus();
  });
});
