import { useEffect, useRef } from 'react';
import { useOnline } from '@/lib/useOnline';

/**
 * Retries once after the browser regains a connection and a read has failed —
 * not on every render while already online and failed, which would retry
 * nothing new and just repeat the same rejection.
 *
 * Scoped to callers that have already decided the failure is worth retrying:
 * `useOnline`'s own caveat is that `true` is a hint to retry, not proof it will
 * succeed, so a `retry` that fails again simply leaves the caller's error state
 * set for the next transition to try. Retrying an access-denied error is a
 * different failure this hook does not decide — see each caller's `isUnreachable`
 * guard.
 *
 * Every provider this backs deliberately does not raise `loading` for a
 * `refresh`: the data in hand is one read stale, not invalid, and the screen
 * showing it is the right thing to keep showing while the retry is in
 * flight. The same is true of the error this retry is trying to clear — each
 * provider's `refresh` holds it until the retry actually lands, rather than
 * clearing it the moment the retry starts, so a slow retry never renders the
 * gap in between as "loaded, and empty".
 *
 * **One retry in flight at a time.** `failed` stays true for as long as that
 * retry takes, precisely because of the paragraph above — so a connection
 * that flaps offline and online again before it lands would otherwise start
 * a second one over the first. The provider's `walk` counter keeps that safe
 * (the stale result is discarded), but it is still a second read charged for
 * no reason, which is exactly the overlap #84 asked this hook to avoid.
 */
export function useRetryOnReconnect(failed: boolean, retry: () => void | Promise<void>): void {
  const online = useOnline();
  const reconnectPending = useRef(!online);
  const retrying = useRef(false);

  useEffect(() => {
    if (!online) {
      reconnectPending.current = true;
      return;
    }

    // A read that began offline can reject after the online event. Keep that
    // reconnect available until the failure is published and can use it.
    if (!reconnectPending.current || !failed) return;

    reconnectPending.current = false;
    if (retrying.current) return;

    retrying.current = true;
    // `retry` is always a provider's `refresh`, which already catches its
    // own failure into the caller's error state and never rejects — the
    // `catch` here guards the hook's public contract, typed to accept a
    // rejecting `Promise<void>`, not a rejection this codebase produces.
    void Promise.resolve(retry())
      .catch(() => undefined)
      .finally(() => {
        retrying.current = false;
      });
  }, [online, failed, retry]);
}
