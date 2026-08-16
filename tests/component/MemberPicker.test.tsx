import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { idleDrag } from '../fixtures/drag';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

const SHOWN = [
  makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ' }),
  makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう' }),
];

const setup = (busy = false) => {
  const onAdd = vi.fn();
  const onAddAll = vi.fn();
  render(
    <MemberPicker
      shown={SHOWN}
      // More matched than is rendered, which is the case the button's label has
      // to survive.
      total={137}
      list="candidates"
      drag={idleDrag}
      busy={busy}
      onAdd={onAdd}
      onAddAll={onAddAll}
    />,
  );
  return { onAdd, onAddAll };
};

const addAll = () => screen.getByRole('button', { name: /語を追加$/ });

describe('MemberPicker', () => {
  it('reports the word behind the ＋追加 that was pressed', () => {
    const { onAdd } = setup();

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 追加' })[1]!);

    expect(onAdd).toHaveBeenCalledWith('w2');
  });

  /**
   * The rendered rows are capped and the match count is not, so "add all" has
   * to mean the rows on screen and say so. A button reading 「すべて追加」 next
   * to 「137 語」 is a promise to add 137 words; pressing it adds 50, and which
   * 87 were left out is not visible anywhere.
   */
  it('adds the words on screen, and names how many that is', () => {
    const { onAddAll } = setup();
    expect(addAll()).toHaveTextContent('表示中の 2 語を追加');

    fireEvent.click(addAll());

    expect(onAddAll).toHaveBeenCalledWith(['w1', 'w2']);
  });

  /**
   * Looks like styling and is not. Every add sends the set's *whole* `entryIds`
   * array, built from the copy this render was given, so a second press before
   * the first write has been read back sends a list that never contained the
   * first word — the learner adds two words, sees one, and nothing reports an
   * error. The route refuses the second write regardless; without this the
   * button still looks like it worked.
   */
  it('takes no further additions while a write is still in flight', () => {
    const { onAdd, onAddAll } = setup(true);

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 追加' })[0]!);
    fireEvent.click(addAll());

    expect(onAdd).not.toHaveBeenCalled();
    expect(onAddAll).not.toHaveBeenCalled();
  });
});
