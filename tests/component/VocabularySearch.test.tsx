import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularySearch } from '@/components/browse/VocabularySearch';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

const placeholder = '見出し語・読み方・タグ・意味・例文で検索';

function setup() {
  const searched = vi.fn();

  function Harness() {
    const [value, setValue] = useState('');
    return (
      <VocabularySearch
        value={value}
        onChange={(next) => {
          searched(next);
          setValue(next);
        }}
      />
    );
  }

  render(<Harness />);
  return { input: screen.getByPlaceholderText(placeholder), searched };
}

describe('VocabularySearch — IME composition', () => {
  it.each([
    { name: 'Cangjie', interim: ['十', '十一', '十一尸', '十一尸人'], final: '家' },
    { name: 'Romaji', interim: ['h', 'hi', 'ひ'], final: '久' },
  ])('waits for $name to choose the character before searching', ({ interim, final }) => {
    const { input, searched } = setup();

    fireEvent.compositionStart(input);
    for (const value of interim) fireEvent.change(input, { target: { value } });
    expect(searched).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: final } });
    fireEvent.compositionEnd(input);

    expect(searched).toHaveBeenCalledOnce();
    expect(searched).toHaveBeenCalledWith(final);
    expect(input).toHaveValue(final);
  });

  it('deduplicates a final change after compositionend without swallowing later input', () => {
    const { input, searched } = setup();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'か' } });
    fireEvent.compositionEnd(input, { target: { value: '家' } });
    // Some browsers emit the committed value as a final input event after
    // compositionend. It is the same edit, not a second search navigation.
    fireEvent.change(input, { target: { value: '家' } });

    expect(searched).toHaveBeenCalledTimes(1);
    expect(searched).toHaveBeenLastCalledWith('家');

    fireEvent.change(input, { target: { value: '家族' } });
    expect(searched).toHaveBeenCalledTimes(2);
    expect(searched).toHaveBeenLastCalledWith('家族');
  });

  it('searches ordinary non-IME input immediately', () => {
    const { input, searched } = setup();

    fireEvent.change(input, { target: { value: 'manifest' } });

    expect(searched).toHaveBeenCalledWith('manifest');
  });
});
