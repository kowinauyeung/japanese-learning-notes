import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CopyDiagnostics } from '@/components/CopyDiagnostics';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * The copy button on the screen a user reaches when something is already
 * broken. Both ways it can fail have to end in a message, because neither ends
 * anywhere else: React does not route an error thrown in an event handler to an
 * error boundary, and a rejected promise with no catch is only a console
 * warning. What the user sees in either case is a button that does nothing.
 *
 * `navigator.clipboard` is undefined outside a secure context, which on a
 * hosted site means a plain-HTTP origin — the state a user is most likely to be
 * in while filing a report about the site not working.
 */

const FAILED = 'コピーできませんでした。上のテキストを選択してコピーしてください。';

const setup = () =>
  render(
    <MemoryRouter>
      <CopyDiagnostics errorId="err-1" />
    </MemoryRouter>,
  );

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

describe('CopyDiagnostics — the failure paths', () => {
  it('reports failure when there is no clipboard at all, rather than going quiet', () => {
    withClipboard(undefined);
    setup();
    fireEvent.click(screen.getByRole('button', { name: '診断情報をコピー' }));
    expect(screen.getByText(FAILED)).toBeInTheDocument();
  });

  it('reports failure when writeText rejects, which permission and focus errors do', async () => {
    withClipboard({ writeText: () => Promise.reject(new Error('denied')) });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '診断情報をコピー' }));
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
  });

  it('says so on success, and says nothing about failing', async () => {
    withClipboard({ writeText: () => Promise.resolve() });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '診断情報をコピー' }));
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });
});
