import { describe, expect, it } from 'vitest';
import {
  ACCESS_DENIED_MESSAGE,
  isAccessDenied,
  loadErrorMessage,
  OFFLINE_MESSAGE,
} from '@/lib/loadError';

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
   * Reads like a wording check and is not one. Re-authenticating clears exactly
   * one of the three causes of `permission-denied` — an account with no claim at
   * all, and a rejected App Check token, both survive it. Without a second step
   * the reader follows the only instruction on screen, arrives back where they
   * started, and the message has told them to do the thing that cannot work.
   * `/support` is where those two are resolved, and it is reachable from here.
   */
  it('offers a way out for the denials that signing in again cannot clear', () => {
    expect(ACCESS_DENIED_MESSAGE).toContain('サポート');
  });

  /**
   * **This expectation was reversed deliberately, and the reasoning it replaces
   * is worth keeping in view.** It used to assert that `unavailable` kept the
   * subject-specific wording, on the grounds that "a network failure is
   * genuinely about the thing being read". #63 makes the opposite case, and it
   * is the better one: nothing is wrong with the word and nothing is wrong with
   * the read — the device is offline, which is a fact about the device and
   * identical on every screen.
   *
   * What the original test was actually protecting is untouched and asserted
   * immediately below: a dropped connection must never be routed to the
   * access-denied message, because telling that reader to sign out and back in
   * sends them nowhere. Adding a third branch satisfies that; it was only
   * lumping the two together that the old wording ruled out.
   */
  const offline = () =>
    Object.assign(new Error('Failed to get document because the client is offline'), {
      code: 'unavailable',
    });

  it('names a dropped connection instead of blaming the thing being read', () => {
    expect(loadErrorMessage(offline(), '練習履歴を読み込めませんでした。')).toBe(OFFLINE_MESSAGE);
  });

  it('still never sends a disconnected reader to sign in again, which fixes nothing', () => {
    expect(loadErrorMessage(offline(), '練習履歴を読み込めませんでした。')).not.toBe(
      ACCESS_DENIED_MESSAGE,
    );
    expect(isAccessDenied(offline())).toBe(false);
  });

  /**
   * The narrow part of the branch, and the reason it is not simply "any
   * failure while offline". Measured against the emulator with the network
   * disabled: `getDoc` throws `unavailable`, while `getDocs` and `onSnapshot`
   * succeed from the cache with `metadata.fromCache` set. A read the cache can
   * answer never reaches this function at all.
   */
  it('claims only the code that means the backend was unreachable', () => {
    const corrupt = Object.assign(new Error('Document parse failure'), {
      code: 'data-loss',
    });
    expect(loadErrorMessage(corrupt, '単語を読み込めませんでした。')).toBe(
      '単語を読み込めませんでした。',
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
