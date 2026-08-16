import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MemberList } from '@/components/wordsets/MemberList';
import type { ListDrag } from '@/lib/listDrag';
import { VocabDialogProvider } from '@/lib/vocabDialog';
import { idleDrag } from '../fixtures/drag';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

const MEMBERS = [
  makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ' }),
  makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう' }),
];

const setup = (busy = false, drag: ListDrag = idleDrag) => {
  const onMoveBy = vi.fn();
  const onRemoveAll = vi.fn();
  // Each row links to its word, and a Link needs a router. React Router's own
  // in-memory one, not a stand-in for anything of ours.
  const { container } = render(
    <MemoryRouter>
      <VocabDialogProvider>
        <MemberList
          members={MEMBERS}
          list="members"
          drag={drag}
          busy={busy}
          onRemove={vi.fn()}
          onRemoveAll={onRemoveAll}
          onMoveBy={onMoveBy}
        />
      </VocabDialogProvider>
    </MemoryRouter>,
  );
  return {
    onMoveBy,
    onRemoveAll,
    grip: screen.getByRole('button', { name: '兆候を並び替え' }),
    list: container.querySelector('[data-drop-list="members"]'),
  };
};

const FROM_PICKER = { list: 'candidates', id: 'w9', index: 0 };

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

/**
 * Which list will accept the word being dragged.
 *
 * This reads like a styling assertion and is not one. 単語を探す is a drag
 * source that refuses drops, so 収録語 is the only panel a release does
 * anything over — and with nothing marking it, a drop on the wrong half of the
 * screen is silently ignored and the whole gesture looks broken. `idle` is the
 * third state on purpose: an outline that is always on says nothing at the
 * moment it is needed.
 */
describe('MemberList — saying where a word can be dropped', () => {
  it('offers nothing while no drag is happening', () => {
    expect(setup().list).toHaveAttribute('data-drop-state', 'idle');
  });

  it('marks itself as available once a word is picked up elsewhere', () => {
    const dragging = { ...idleDrag, dragging: FROM_PICKER };
    expect(setup(false, dragging).list).toHaveAttribute('data-drop-state', 'ready');
  });

  it('marks itself as the target once the pointer is over it', () => {
    const over = { ...idleDrag, dragging: FROM_PICKER, at: { list: 'members', index: 1 } };
    expect(setup(false, over).list).toHaveAttribute('data-drop-state', 'over');
  });
});

/**
 * The mirror of 表示中の N 語を追加, and the more dangerous of the pair.
 *
 * It hands the ids up rather than acting: emptying a set destroys the study
 * order, which took dragging to build and is recorded nowhere else, so the
 * route puts a confirmation in front of it.
 */
describe('MemberList — removing everything on screen', () => {
  const removeAll = () => screen.getByRole('button', { name: /語を削除$/ });

  it('asks about exactly the words it is showing', () => {
    const { onRemoveAll } = setup();
    expect(removeAll()).toHaveTextContent('表示中の 2 語を削除');

    fireEvent.click(removeAll());

    expect(onRemoveAll).toHaveBeenCalledWith(['w1', 'w2']);
  });

  it('asks nothing while a write is still in flight', () => {
    const { onRemoveAll } = setup(true);

    fireEvent.click(removeAll());

    expect(onRemoveAll).not.toHaveBeenCalled();
  });
});
