import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  emptyJsonImport,
  JsonImport,
  type JsonImportState,
} from '@/components/entry-form/JsonImport';

const withClipboard = (clipboard: unknown) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  withClipboard(undefined);
});

function Harness({ initial }: { initial: JsonImportState }) {
  const [value, setValue] = useState(initial);
  return <JsonImport value={value} onChange={setValue} />;
}

describe('JsonImport — translation language preference', () => {
  it('shows the saved translation language as the initial editable value', () => {
    render(<Harness initial={emptyJsonImport('yue-Hant')} />);

    expect(screen.getByRole('textbox', { name: '訳の言語' })).toHaveValue('廣東話');
  });

  it('keeps a manual language override in the prompt instead of restoring the saved default', async () => {
    let copied = '';
    withClipboard({
      writeText: (text: string) => {
        copied = text;
        return Promise.resolve();
      },
    });
    render(<Harness initial={emptyJsonImport('en')} />);

    fireEvent.change(screen.getByRole('textbox', { name: '訳の言語' }), {
      target: { value: '廣東話' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'プロンプトをコピー' }));

    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
    expect(copied).toContain('廣東話');
    expect(copied).not.toContain('Englishで書いてください');
  });
});
