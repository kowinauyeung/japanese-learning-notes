import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EntryHeadline } from '@/components/detail/EntryHeadline';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

const entry = makeEntry({ headword: '兆候', reading: 'ちょうこう' });

describe('EntryHeadline — page heading semantics', () => {
  it('makes the detail page headword its h1, so assistive technology can identify the entry', () => {
    render(
      <MemoryRouter>
        <EntryHeadline entry={entry} pageHeading />
      </MemoryRouter>,
    );

    // The headword is the page subject. Without this h1, navigating headings
    // announces no entry name even though the word is the first visible content.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('兆候');
  });

  it('leaves the compact dialog headword unheaded, because its modal title already names the dialog', () => {
    render(
      <MemoryRouter>
        <EntryHeadline entry={entry} compact />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
