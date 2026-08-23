import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickerToolbar } from '@/components/wordsets/PickerToolbar';
import { EMPTY_FILTERS } from '@/lib/filters';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

describe('PickerToolbar', () => {
  /**
   * Layout, not tidiness, and the reason belongs on the assertion: 単語's filter
   * panel is around 200px tall, and it sits above both of the bounded lists it
   * shares the screen with. Rendered open it takes that height off each of
   * them, and a drag whose source and target are both scrolled away cannot be
   * performed at all.
   */
  it('keeps the filter panel folded away until it is asked for', () => {
    render(<PickerToolbar filters={EMPTY_FILTERS} allTags={[]} onChange={vi.fn()} />);
    expect(screen.queryByText('追加日（新しい順）')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /絞り込み/ }));

    expect(screen.getByText('追加日（新しい順）')).toBeInTheDocument();
  });

  it('types into the same search the notebook is filtered by', () => {
    const onChange = vi.fn();
    render(<PickerToolbar filters={EMPTY_FILTERS} allTags={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('見出し語・読み方・タグ・意味・例文で検索'), {
      target: { value: '兆' },
    });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, q: '兆' });
  });
});
