import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { idleDrag } from '../fixtures/drag';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

const SHOWN = [
  makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ', citationForm: '' }),
  makeEntry({
    id: 'w2',
    headword: '兆候',
    reading: 'ちょうこう',
    source: 'YouTube 会議録 / YouTube [live] ガリレオ・ねんがん',
    citationForm: '兆し',
  }),
];

const setup = (busy = false, query = '') => {
  const onAdd = vi.fn();
  const onAddAll = vi.fn();
  render(
    <MemberPicker
      shown={SHOWN}
      query={query}
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
  it.each([
    ['兆候', '見出し語', '兆候'],
    ['ちょう', '読み方', 'ちょうこう'],
    ['  YOUTUBE  ', '出典', 'YouTube 会議録'],
    ['兆し', '登録形', '兆し'],
  ])('explains a match for %s', (query, label, value) => {
    setup(false, query);
    const badge = screen.getByText(label);
    expect(badge.parentElement).toHaveTextContent(value);
  });

  it('highlights every occurrence while preserving the original case', () => {
    setup(false, '  YOUTUBE  ');
    const source = screen.getByText('出典').parentElement!;
    expect([...source.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'YouTube',
      'YouTube',
    ]);
    expect(source).toHaveTextContent('YouTube 会議録 / YouTube [live] ガリレオ・ねんがん');
  });

  it('treats regex punctuation as literal search text', () => {
    setup(false, '[live]');
    const source = screen.getByText('出典').parentElement!;
    expect(source.querySelector('mark')).toHaveTextContent('[live]');
    expect(source.querySelectorAll('mark')).toHaveLength(1);
  });

  it('highlights Japanese matches in both the word and its matching fields', () => {
    setup(false, '兆');
    const row = screen.getByText('見出し語').closest('li')!;
    expect([...row.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      '兆',
      '兆',
      '兆',
    ]);
  });

  it.each(['が', 'ガ'])(
    'highlights both kana scripts for %s without changing spelling',
    (query) => {
      setup(false, query);
      const source = screen.getByText('出典').parentElement!;
      expect([...source.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
        'ガ',
        'が',
      ]);
      expect(source).toHaveTextContent('ガリレオ・ねんがん');
    },
  );

  it('shows every matching field', () => {
    setup(false, '兆');
    expect(screen.getByText('見出し語')).toBeInTheDocument();
    expect(screen.getByText('登録形')).toBeInTheDocument();
    expect(screen.queryByText('出典')).not.toBeInTheDocument();
  });

  it.each(['', '   '])('hides match indicators for an empty query %j', (query) => {
    setup(false, query);
    expect(screen.queryByText('見出し語')).not.toBeInTheDocument();
    expect(screen.queryByText('出典')).not.toBeInTheDocument();
    expect(document.querySelector('mark')).not.toBeInTheDocument();
  });

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
