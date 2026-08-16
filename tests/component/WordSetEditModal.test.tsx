import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WordSetEditModal } from '@/components/wordsets/WordSetEditModal';
import { makeWordSet } from '../fixtures/wordSet';

const set = makeWordSet({ name: '仕事の語', description: '会議で出てきた語' });

const setup = () => {
  const onSave = vi.fn();
  const view = render(
    <WordSetEditModal open set={set} busy={false} error={null} onSave={onSave} onClose={vi.fn()} />,
  );
  return { onSave, view, name: screen.getByLabelText(/名前/) };
};

describe('WordSetEditModal', () => {
  /**
   * The form holds its own copy of the fields, so without the reset the text a
   * cancelled edit left behind is still there on reopen — and the next 保存する
   * writes the name the user had already decided against.
   */
  it('shows the stored name again after an edit was cancelled', () => {
    const { view, name } = setup();
    fireEvent.change(name, { target: { value: '捨てる名前' } });

    view.rerender(
      <WordSetEditModal
        open={false}
        set={set}
        busy={false}
        error={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    view.rerender(
      <WordSetEditModal
        open
        set={set}
        busy={false}
        error={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/名前/)).toHaveValue('仕事の語');
  });

  /**
   * A set with no name is unidentifiable in the list and in the practice chips,
   * and `sanitizeWordSet` would coerce it to `''` rather than refuse it.
   */
  it('refuses to save a name that is only whitespace', () => {
    const { onSave, name } = setup();
    fireEvent.change(name, { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: '保存する' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('名前は必須です。')).toBeInTheDocument();
  });
});
