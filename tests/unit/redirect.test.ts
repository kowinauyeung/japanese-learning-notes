import { describe, expect, it } from 'vitest';
import { safeRedirect } from '@/lib/redirect';

/**
 * `state.from` arrives through history state, which any page can write, and is
 * fed straight to `<Navigate to>`. An open redirect here is worth more to an
 * attacker than it looks: the victim arrives at the fake page having just
 * completed a real Google sign-in, which is the moment they are least likely to
 * check the address bar.
 */
describe('safeRedirect', () => {
  it('keeps a same-origin path, including its query and hash', () => {
    expect(safeRedirect({ from: '/vocabulary' })).toBe('/vocabulary');
    expect(safeRedirect({ from: '/vocabulary?jlpt=N1&tag=会議#top' })).toBe(
      '/vocabulary?jlpt=N1&tag=会議#top',
    );
  });

  /**
   * The one that matters. A browser reads `//evil.com` as protocol-relative and
   * navigates off-site, so a "starts with /" check on its own is not enough.
   */
  it.each(['//evil.com', '///evil.com', '//evil.com/vocabulary'])(
    'refuses the protocol-relative %s',
    (from) => {
      expect(safeRedirect({ from })).toBe('/');
    },
  );

  it.each([
    'https://evil.com',
    'http://evil.com/vocabulary',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vocabulary',
    '../account',
  ])('refuses the non-relative %s', (from) => {
    expect(safeRedirect({ from })).toBe('/');
  });

  it.each([null, undefined, {}, { from: null }, { from: 42 }, { from: ['/x'] }, 'nonsense', []])(
    'falls back to the root for the malformed state %o',
    (state) => {
      expect(safeRedirect(state)).toBe('/');
    },
  );

  it('accepts the root itself', () => {
    expect(safeRedirect({ from: '/' })).toBe('/');
  });
});
