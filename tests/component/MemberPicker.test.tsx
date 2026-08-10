import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { makeEntry } from '../fixtures/entry';
import { makeWordSet } from '../fixtures/wordSet';

const NOTEBOOK = [
  makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ' }),
  makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう' }),
];

const setup = (busy = false) => {
  const onAdd = vi.fn();
  render(<MemberPicker set={makeWordSet()} entries={NOTEBOOK} busy={busy} onAdd={onAdd} />);
  return { onAdd, search: screen.getByPlaceholderText('見出し語・読み方で検索') };
};

describe('MemberPicker', () => {
  it('reports the word behind the ＋追加 that was pressed', () => {
    const { onAdd, search } = setup();
    fireEvent.change(search, { target: { value: 'ちょうこう' } });

    fireEvent.click(screen.getByRole('button', { name: '＋ 追加' }));

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
  it('takes no further additions while a write is still in flight', () => {
    const { onAdd, search } = setup(true);
    fireEvent.change(search, { target: { value: 'ちょうこう' } });

    fireEvent.click(screen.getByRole('button', { name: '＋ 追加' }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
