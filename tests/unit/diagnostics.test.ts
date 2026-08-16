import { describe, expect, it } from 'vitest';
import { collectDiagnostics, formatDiagnostics, newErrorId, routePattern } from '@/lib/diagnostics';

/**
 * What a bug report may carry. The exclusions are the point: no uid, no email,
 * no token, no vocabulary — a promise made without qualification in the privacy
 * policy and again under the copy button.
 */
describe('routePattern', () => {
  it('names the screen, not the document', () => {
    expect(routePattern('/vocabulary/abc123')).toBe('/vocabulary/:id');
    expect(routePattern('/wordsets/xyz789')).toBe('/wordsets/:id');
  });

  /**
   * The version this replaced matched any segment of twelve characters or more.
   * That covers every id the app mints today — all four sources are Firestore
   * auto-ids, all twenty characters — and rests on a vendor's id length staying
   * put. A readable slug walks straight through it, silently, which is the one
   * direction where silence is the whole problem.
   */
  it('redacts a short or readable id, which a length rule would have let through', () => {
    expect(routePattern('/vocabulary/w-choukou')).toBe('/vocabulary/:id');
    expect(routePattern('/vocabulary/x')).toBe('/vocabulary/:id');
  });

  it('keeps the two practice modes, which are enumerable and not identifiers', () => {
    expect(routePattern('/practice/flashcards')).toBe('/practice/flashcards');
    expect(routePattern('/practice/dictation')).toBe('/practice/dictation');
    expect(routePattern('/practice/something-else')).toBe('/practice/:mode');
  });

  it('leaves the pages that carry no identifier alone', () => {
    expect(routePattern('/')).toBe('/');
    expect(routePattern('/history')).toBe('/history');
    expect(routePattern('/privacy')).toBe('/privacy');
  });
});

describe('collectDiagnostics', () => {
  const made = () =>
    collectDiagnostics({
      projectId: 'goitei',
      pathname: '/vocabulary/abc123def456',
      errorId: 'abc123',
      now: new Date('2026-08-13T00:00:00Z'),
      nav: { userAgent: 'UA' },
      win: { innerWidth: 800, innerHeight: 600 },
    });

  it('carries no address, no identifier and no vocabulary', () => {
    const text = formatDiagnostics(made());

    expect(text).not.toContain('abc123def456');
    expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    expect(text).toContain('/vocabulary/:id');
  });

  /**
   * `Local`, not `Production`, and that is the right answer: the environment is
   * derived from the build mode as well as the project, and a test build is not
   * a release however production-like the project id looks.
   */
  it('does not call a test build Production, whatever project it names', () => {
    expect(made().environment).toBe('Local');
  });
});

describe('newErrorId', () => {
  it('is short enough to read off a screen and say aloud', () => {
    expect(newErrorId(() => 0.5)).toHaveLength(6);
  });

  /** A random source that returns something tiny must still fill the width. */
  it('pads rather than returning a shorter id', () => {
    expect(newErrorId(() => 0)).toHaveLength(6);
  });
});
