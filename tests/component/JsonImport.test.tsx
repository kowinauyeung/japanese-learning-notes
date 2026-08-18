import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  emptyJsonImport,
  JsonImport,
  type JsonImportState,
} from '@/components/entry-form/JsonImport';
import { buildPrompt } from '@/lib/jsonImport';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

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

const FAILED = 'コピーできませんでした。下のプロンプトを選択してコピーしてください。';

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
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });
});

/**
 * The prompt exists nowhere else on the screen, so a copy that fails silently
 * leaves the user with no way to reach the text at all — the button is the only
 * route to it.
 *
 * `navigator.clipboard` is undefined outside a secure context and in the in-app
 * webviews a phone opens links in, and calling `writeText` on it throws
 * synchronously. React does not route a throw in an event handler to an error
 * boundary, and the rejection of a promise nobody awaits is a console warning,
 * so either way what the user sees is a button that does nothing.
 */
describe('JsonImport — copying the prompt when the clipboard is unavailable', () => {
  const typeWord = () =>
    fireEvent.change(screen.getByRole('textbox', { name: '単語' }), {
      target: { value: '兆候' },
    });

  const clickCopy = () =>
    fireEvent.click(screen.getByRole('button', { name: 'プロンプトをコピー' }));

  it('offers the prompt for manual copying when there is no clipboard, as in a phone in-app webview', () => {
    withClipboard(undefined);
    render(<Harness initial={emptyJsonImport('ja')} />);

    typeWord();
    clickCopy();

    expect(screen.getByText(FAILED)).toBeInTheDocument();
    // The whole prompt, not a truncated preview: what is on screen has to be
    // the thing the clipboard would have been given.
    expect(screen.getByRole('textbox', { name: 'プロンプト' })).toHaveValue(
      buildPrompt('兆候', '日本語', { original: '', source: '' }),
    );
    expect(screen.queryByRole('button', { name: 'コピーしました' })).not.toBeInTheDocument();
  });

  it('offers the prompt for manual copying when writeText rejects, which a denied permission does', async () => {
    withClipboard({ writeText: () => Promise.reject(new Error('NotAllowedError')) });
    render(<Harness initial={emptyJsonImport('ja')} />);

    typeWord();
    clickCopy();

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'プロンプト' })).toHaveValue(
      buildPrompt('兆候', '日本語', { original: '', source: '' }),
    );
  });
});
