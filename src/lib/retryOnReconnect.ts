import { useEffect, useRef } from 'react';
import { useOnline } from '@/lib/useOnline';

/**
 * Retries once when the browser regains a connection, and only on the
 * transition into it — not on every render while already online and failed,
 * which would retry nothing new and just repeat the same rejection.
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
 * showing it — or the error in its place — is the right thing to keep
 * showing while the retry is in flight.
 */
export function useRetryOnReconnect(failed: boolean, retry: () => void | Promise<void>): void {
  const online = useOnline();
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (online && wasOffline.current && failed) void retry();
    wasOffline.current = !online;
  }, [online, failed, retry]);
}
