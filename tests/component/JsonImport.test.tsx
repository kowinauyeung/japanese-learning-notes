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
    // Absence, because the two messages contradict each other: a button still
    // reading コピーしました tells the user the prompt is on their clipboard while
    // the fallback below tells them to copy it by hand, and the one they believe
    // is the one that leaves them with nothing pasted.
    expect(screen.queryByRole('button', { name: 'コピーしました' })).not.toBeInTheDocument();
  });

  it('offers the prompt for manual copying when writeText throws synchronously, which an in-app webview stub does', () => {
    withClipboard({
      writeText: () => {
        throw new DOMException('Document is not focused', 'NotAllowedError');
      },
    });
    render(<Harness initial={emptyJsonImport('ja')} />);

    typeWord();
    clickCopy();

    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'プロンプト' })).toHaveValue(
      buildPrompt('兆候', '日本語', { original: '', source: '' }),
    );
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

/**
 * The paste box is the one field in this form with no `maxLength`, and it has
 * to stay that way.
 *
 * This reads as an assertion about an attribute and is not one. `jsonToDraft`
 * refuses a paste past `INPUT_LIMITS.jsonPaste` and says how large it was, and
 * the browser applies `maxlength` to a paste by *inserting the first n
 * characters* — so with the attribute present the oversized branch is dead
 * code, the value handed to the parser is a JSON document cut off mid-object,
 * and what the user is told is that their JSON does not parse. The one fact
 * they need, that it was simply too big, is the one that can no longer be said.
 *
 * jsdom will not reproduce that: `maxlength` constrains user editing, and
 * setting `value` from a test is not user editing. The attribute's presence is
 * what the browser acts on, so the attribute is what this checks.
 */
describe('JsonImport — the paste box', () => {
  it('does not cap the pasted JSON, which would truncate it out of the size check', () => {
    render(<Harness initial={emptyJsonImport('ja')} />);

    const paste = screen.getByRole('textbox', { name: 'AI の返した JSON を貼り付け' });
    expect(paste).not.toHaveAttribute('maxlength');
  });

  /** The fields beside it are bounded, so the absence above is a decision. */
  it('still caps the short fields the user types by hand', () => {
    render(<Harness initial={emptyJsonImport('ja')} />);

    expect(screen.getByRole('textbox', { name: '訳の言語' })).toHaveAttribute('maxlength');
  });
});
