import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/I18nProvider';
import { Component as Home } from '@/routes/Home';

describe('I18nProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the first supported browser preference when no profile locale is injected', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'ko-KR']);

    render(
      <MemoryRouter>
        <I18nProvider>
          <Home />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '만든 이유' })).toBeInTheDocument();
  });

  it('renders the public landing page in an injected locale and updates when the preference changes', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <I18nProvider locale="es">
          <Home />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Iniciar sesión con Google' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Por qué existe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacidad' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'es'));

    rerender(
      <MemoryRouter>
        <I18nProvider locale="ja">
          <Home />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Google でログイン' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'つくった理由' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'ja'));
  });
});
