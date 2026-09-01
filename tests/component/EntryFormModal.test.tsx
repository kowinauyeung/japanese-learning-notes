import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryFormModal } from '@/components/entry-form/EntryFormModal';
import { I18nProvider } from '@/i18n/I18nProvider';
import { messages } from '@/i18n/messages';
import { EntriesProvider } from '@/lib/entries';
import { render } from '@testing-library/react';

const ja = (key: keyof (typeof messages)['ja']) => messages.ja[key];

const withClipboard = (clipboard: unknown) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  withClipboard(undefined);
  delete (window as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__;
});

function mount() {
  render(
    <I18nProvider locale="ja">
      <MemoryRouter>
        <EntriesProvider uid="modal-test-user">
          <EntryFormModal open onClose={vi.fn()} />
        </EntriesProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('EntryFormModal — clipboard paste while a handoff is visible', () => {
  it('locks import and save while the clipboard permission waits, without clearing the AI handoff', async () => {
    (window as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__ = { entryDrafting: 'failed' };
    let release!: (text: string) => void;
    withClipboard({ readText: () => new Promise<string>((resolve) => (release = resolve)) });
    mount();

    fireEvent.change(screen.getByRole('textbox', { name: /^見出し語/ }), {
      target: { value: '兆候' },
    });
    fireEvent.click(screen.getByRole('button', { name: ja('import.draftAndSave') }));

    await screen.findByText(ja('import.aiHandoff'));
    fireEvent.change(screen.getByRole('textbox', { name: ja('import.pasteJson') }), {
      target: { value: '{"headword":"既存"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: ja('import.paste') }));

    // A browser permission prompt can hold readText open. Acting on the footer
    // then either drops the paste or saves the draft it was about to replace.
    expect(screen.getByRole('button', { name: ja('form.import') })).toBeDisabled();
    expect(screen.getByRole('button', { name: ja('form.save') })).toBeDisabled();
    expect(screen.getByText(ja('import.aiHandoff'))).toBeVisible();

    release('{"headword":"兆候"}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: ja('form.save') })).toBeEnabled(),
    );
  });
});
