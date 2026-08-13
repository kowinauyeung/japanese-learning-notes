import { describe, expect, it } from 'vitest';
import { ACCESS_DENIED_MESSAGE, isAccessDenied, loadErrorMessage } from '@/lib/loadError';

/**
 * Deploying rules that gate on the `allowed` custom claim to a project where no
 * account carries it yet denies every read at once, and every screen said the
 * words could not be loaded — the same sentence a dropped connection produces.
 * The distinction is the whole point: one clears itself, the other needs the
 * reader to sign out and back in, and nothing on screen said so.
 */
describe('loadErrorMessage', () => {
  it('tells a denied account what to do instead of blaming the connection', () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    expect(loadErrorMessage(denied, '単語を読み込めませんでした。')).toBe(ACCESS_DENIED_MESSAGE);
  });

  /**
   * An ID token that has expired is the same situation one hour later, and is
   * how a grant made during a live session first shows up.
   */
  it('treats an expired token the same way, since re-signing in is the same fix', () => {
    const stale = Object.assign(new Error('Unauthenticated'), { code: 'unauthenticated' });
    expect(loadErrorMessage(stale, '単語集を読み込めませんでした。')).toBe(ACCESS_DENIED_MESSAGE);
  });

  /**
   * The fallback has to survive, or this change trades one indiscriminate
   * message for another: a network failure is genuinely about the thing being
   * read, and telling that reader to sign in again sends them nowhere.
   */
  it('keeps the subject-specific wording for a failure that is not about access', () => {
    const offline = Object.assign(
      new Error('Failed to get document because the client is offline'),
      {
        code: 'unavailable',
      },
    );
    expect(loadErrorMessage(offline, '練習履歴を読み込めませんでした。')).toBe(
      '練習履歴を読み込めませんでした。',
    );
  });

  /**
   * `code` is read off whatever was thrown, and a `catch` receives anything at
   * all. Reading a property off null throws, which inside the catch block that
   * calls this would replace a load failure with a blank screen.
   */
  it.each([null, undefined, 'permission-denied', 42, new Error('no code at all')])(
    'reports %s as an ordinary failure rather than throwing while handling one',
    (cause) => {
      expect(isAccessDenied(cause)).toBe(false);
      expect(loadErrorMessage(cause, '単語を読み込めませんでした。')).toBe(
        '単語を読み込めませんでした。',
      );
    },
  );
});
