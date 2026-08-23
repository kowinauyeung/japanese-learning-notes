import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from '@/components/Avatar';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

describe('Avatar', () => {
  it('shows the picture the identity provider supplied', () => {
    render(<Avatar photoUrl="https://lh3.googleusercontent.com/a/abc123" initial="K" alt="写真" />);

    expect(screen.getByRole('img', { name: '写真' })).toHaveAttribute(
      'src',
      'https://lh3.googleusercontent.com/a/abc123',
    );
    expect(screen.queryByText('K')).not.toBeInTheDocument();
  });

  it('falls back to the initial when the provider supplied no picture', () => {
    render(<Avatar photoUrl="" initial="K" alt="写真" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  /**
   * Google's avatar host answers 403 or 429 often enough to matter, and a photo
   * URL outlives the file it points at. Without this the account page renders
   * the browser's broken-image glyph where a face should be — worse than the
   * letter it replaced, and with no way back to it.
   */
  it('falls back to the initial when the picture fails to load, instead of leaving a broken image', () => {
    render(<Avatar photoUrl="https://lh3.googleusercontent.com/a/gone" initial="K" alt="写真" />);

    fireEvent.error(screen.getByRole('img', { name: '写真' }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  /**
   * The letter is a stand-in for a face, not content: a screen reader that
   * announces "K" beside the display name is reading the display name's first
   * character back to the user.
   */
  it('hides the fallback letter from assistive technology', () => {
    render(<Avatar photoUrl="" initial="K" alt="写真" />);

    expect(screen.getByText('K')).toHaveAttribute('aria-hidden', 'true');
  });
});
