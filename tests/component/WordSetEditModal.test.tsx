import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WordSetEditModal } from '@/components/wordsets/WordSetEditModal';
import { WORD_SET_LIMITS } from '@/domain/limits';
import { makeWordSet } from '../fixtures/wordSet';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

const set = makeWordSet({ name: '仕事の語', description: '会議で出てきた語' });

const setup = () => {
  const onSave = vi.fn();
  const view = render(
    <WordSetEditModal open set={set} busy={false} error={null} onSave={onSave} onClose={vi.fn()} />,
  );
  return {
    onSave,
    view,
    name: screen.getByLabelText(/名前/),
    description: screen.getByLabelText(/説明/),
  };
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

  /**
   * The DOM maxLength catches real typing; this direct change simulates a
   * bypass and proves the save path still refuses the value before Firestore.
   */
  it('refuses an over-limit name before it reaches Firestore', () => {
    const { onSave, name } = setup();
    fireEvent.change(name, { target: { value: 'W'.repeat(WORD_SET_LIMITS.name + 1) } });

    fireEvent.click(screen.getByRole('button', { name: '保存する' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        `「name」が長すぎます。${WORD_SET_LIMITS.name + 1}字ありますが、上限は${WORD_SET_LIMITS.name}字です。`,
      ),
    ).toBeInTheDocument();
  });

  it('refuses an over-limit description before it reaches Firestore', () => {
    const { onSave, description } = setup();
    fireEvent.change(description, {
      target: { value: 'W'.repeat(WORD_SET_LIMITS.description + 1) },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存する' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        `「description」が長すぎます。${WORD_SET_LIMITS.description + 1}字ありますが、上限は${WORD_SET_LIMITS.description}字です。`,
      ),
    ).toBeInTheDocument();
  });

  /** These are content, not markup or SQL — preserving them is the safe path. */
  it('saves emoji, markup and SQL-shaped text as ordinary text', () => {
    const { onSave, name, description } = setup();
    fireEvent.change(name, { target: { value: '<script>🚀</script>' } });
    fireEvent.change(description, { target: { value: "' OR '1'='1" } });

    fireEvent.click(screen.getByRole('button', { name: '保存する' }));

    expect(onSave).toHaveBeenCalledWith({
      name: '<script>🚀</script>',
      description: "' OR '1'='1",
    });
    // If this fails, user content can render as markup or execute script in the product.
    expect(document.querySelector('script')).toBeNull();
  });
});
