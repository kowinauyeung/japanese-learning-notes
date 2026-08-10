import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { EMPTY_FILTERS } from '@/lib/filters';
import type { ListDrag } from '@/lib/listDrag';
import { makeEntry } from '../fixtures/entry';
import { makeWordSet } from '../fixtures/wordSet';

const NOTEBOOK = [
  makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ', learnedOn: '2026-06-24' }),
  makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう', learnedOn: '2026-06-22' }),
];

/** A drag that is not happening: this file is about the buttons, not the gesture. */
const idle: ListDrag = {
  dragging: null,
  at: null,
  point: null,
  handleProps: () => ({ onPointerDown: () => {} }),
};

const setup = (busy = false) => {
  const onAdd = vi.fn();
  render(
    <MemberPicker
      set={makeWordSet()}
      entries={NOTEBOOK}
      allTags={[]}
      filters={EMPTY_FILTERS}
      list="candidates"
      drag={idle}
      busy={busy}
      onFiltersChange={vi.fn()}
      onAdd={onAdd}
    />,
  );
  return { onAdd };
};

describe('MemberPicker', () => {
  it('reports the word behind the ＋追加 that was pressed', () => {
    const { onAdd } = setup();

    // Newest first with no filters set, so 切り分け leads and 兆候 follows.
    fireEvent.click(screen.getAllByRole('button', { name: '＋ 追加' })[1]!);

    expect(onAdd).toHaveBeenCalledWith('w2');
  });

  /**
   * Looks like styling and is not. Every add sends the set's *whole* `entryIds`
   * array, built from the copy this render was given, so a second ＋追加 pressed
   * before the first write has been read back sends a list that never contained
   * the first word — the learner adds two words, sees one, and nothing reports
   * an error. The route refuses the second write regardless; without this the
   * button still looks like it worked.
   */
  /**
   * Layout, not tidiness, and the reason belongs on the assertion: 一覧's filter
   * panel is around 200px tall. Rendered open it pushes every candidate row
   * past the bottom of a 720px viewport, and a drag whose source and target are
   * never on screen together cannot be performed at all.
   */
  it('keeps the filter panel folded away until it is asked for', () => {
    setup();
    expect(screen.queryByText('追加日（新しい順）')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /絞り込み/ }));

    expect(screen.getByText('追加日（新しい順）')).toBeInTheDocument();
  });

  it('takes no further additions while a write is still in flight', () => {
    const { onAdd } = setup(true);

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 追加' })[0]!);

    expect(onAdd).not.toHaveBeenCalled();
  });
});
