import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VocabularySearch } from '@/components/browse/VocabularySearch';

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

  it('searches ordinary non-IME input immediately', () => {
    const { input, searched } = setup();

    fireEvent.change(input, { target: { value: 'manifest' } });

    expect(searched).toHaveBeenCalledWith('manifest');
  });
});
