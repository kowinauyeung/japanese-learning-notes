import { describe, expect, it } from 'vitest';
import { authenticatedMessages } from '@/i18n/authenticatedMessages';
import {
  ACCESS_DENIED_MESSAGE,
  captureLoadFailure,
  isAccessDenied,
  loadErrorMessage,
  UNREACHABLE_MESSAGE,
} from '@/lib/loadError';

/** What Firestore throws when a read cannot reach the backend. */
const LOCALES = Object.keys(authenticatedMessages) as (keyof typeof authenticatedMessages)[];

const unreachable = () =>
  Object.assign(new Error('Failed to get document because the client is offline'), {
    code: 'unavailable',
  });

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
  it('names a dropped connection instead of blaming the thing being read', () => {
    expect(loadErrorMessage(unreachable(), '練習履歴を読み込めませんでした。')).toBe(
      UNREACHABLE_MESSAGE,
    );
  });

  it('still never sends a disconnected reader to sign in again, which fixes nothing', () => {
    expect(loadErrorMessage(unreachable(), '練習履歴を読み込めませんでした。')).not.toBe(
      ACCESS_DENIED_MESSAGE,
    );
    expect(isAccessDenied(unreachable())).toBe(false);
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

/**
 * Being offline stops a read and a write for different reasons, and the reader
 * has to do different things about them.
 *
 * A read that misses the cache resolves itself: the words arrive when the
 * connection does. A save does not, and the settings save least of all — it is
 * a `runTransaction`, the one Firestore write with no offline path. Measured
 * against the emulator with the socket actually cut rather than with
 * `disableNetwork` (which leaves the transaction's own RPCs reachable, so it
 * commits in under 20ms and measures nothing): the transaction rejects with
 * `unavailable` after six to ten seconds of retries, and nothing is queued.
 * A plain `updateDoc` beside it never settles at all, but does reach the local
 * cache and does sync on reconnect.
 *
 * So one `unavailable` sentence cannot serve both. Told "it will appear once
 * you are back", the reader waits for a save that will never happen.
 */
describe('an offline save is not an offline read', () => {
  it('leaves a read on the reading wording, which is what all but one caller is', () => {
    expect(captureLoadFailure(unreachable(), 'load.entries').unreachable).toBe('load.unreachable');
  });

  it('lets the settings save say it was a save, since waiting will not complete it', () => {
    expect(
      captureLoadFailure(unreachable(), 'load.settingsSave', 'load.unreachableSave').unreachable,
    ).toBe('load.unreachableSave');
  });

  /**
   * The branch itself takes the sentence as an argument and always did — the
   * defect was never in here, which is why this asserts the property that made
   * the one-line fix possible rather than a new behaviour.
   */
  it('renders whichever offline sentence it was handed, rather than one of its own', () => {
    expect(
      loadErrorMessage(unreachable(), '設定を保存できませんでした。', 'denied', 'save wording'),
    ).toBe('save wording');
  });

  /**
   * Reads like a translation check and is not one. The two keys sit adjacent in
   * every catalogue and start with the same clause in every language, so a
   * copy-paste that duplicated the reading sentence would restore the defect in
   * exactly one locale — the one nobody testing in Japanese would open.
   */
  it.each(LOCALES)(
    'gives %s readers a distinct sentence for a save that did not happen',
    (locale) => {
      const messages = authenticatedMessages[locale];
      expect(messages['load.unreachableSave']).not.toBe(messages['load.unreachable']);
    },
  );
});

/**
 * `unavailable` says the backend was not reached. It does not say why.
 *
 * Firestore documents the code as "the service is currently unavailable ...
 * most likely a transient condition", so an outage produces it with the
 * reader's network working perfectly. Both sentences here used to open by
 * telling that reader they were offline, and `OfflineNotice` — which watches
 * `navigator.onLine` and is right — stayed hidden throughout, so the app
 * contradicted itself on one screen.
 */
describe('the unreachable sentences name what was observed, not a cause', () => {
  /**
   * Language-independent, and that is the point of doing it this way. Each
   * catalogue already contains its own word for the state, as `offline.state`
   * — オフライン, 離線, 오프라인, Sin conexión — because that is the pill's
   * label. Asserting against it needs no list of translated words here, and it
   * goes red against every one of the five strings this replaced.
   */
  it.each(LOCALES)('does not tell %s readers the device is offline', (locale) => {
    const messages = authenticatedMessages[locale];
    const deviceState = messages['offline.state'].toLowerCase();
    expect(messages['load.unreachable'].toLowerCase()).not.toContain(deviceState);
    expect(messages['load.unreachableSave'].toLowerCase()).not.toContain(deviceState);
  });

  /**
   * A tripwire on the sentence rather than a proof about the application, and
   * worth having as one.
   *
   * The sentence used to end 「接続が戻ると表示されます」 — it will appear once
   * you are back. Nothing delivers that. Providers load once from an effect
   * keyed on their repository, the only Firestore listener is an internal
   * write-metadata probe, and no error screen offers a retry, so the data
   * arrives when the reader reloads and not before. Promising otherwise leaves
   * someone waiting for something that is not coming.
   *
   * If a provider ever does re-read on reconnect, this test is the thing that
   * has to be deleted deliberately — which is the point of writing it down.
   */
  it('does not promise the words will come back on their own, because nothing brings them', () => {
    expect(UNREACHABLE_MESSAGE).not.toContain('接続が戻る');
    // Says what is true instead: the words already on the device are readable.
    expect(UNREACHABLE_MESSAGE).toContain('保存済みの単語');
  });
});
