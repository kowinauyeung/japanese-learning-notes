/** What `within` resolves to when the work did not finish in time. */
export const TIMED_OUT = Symbol('timed out');

/**
 * Stop waiting for `work` after `ms`, whatever it is still doing.
 *
 * Written because two awaits on the drafting path have no bound of their own,
 * and either one leaves a button reading 「作成中」 for the rest of the session:
 *
 * - `ensureInitialized` in `@firebase/remote-config` returns the promise of an
 *   IndexedDB read with no timeout at all. The `fetchTimeoutMillis` we set
 *   covers `fetchAndActivate`'s network call and nothing else.
 * - `@firebase/ai` awaits the App Check token inside `getHeaders`, which
 *   `makeRequest` awaits while *building* the fetch options — before `fetch`,
 *   and therefore outside the abort signal its own 180-second timeout arms. So
 *   a token that never arrives is a request that is never even sent, and never
 *   gives up. `@firebase/app-check` reaches that state on an ordinary browser:
 *   `loadReCAPTCHAV3Script` sets `script.onload` and no `onerror`, so an ad
 *   blocker or a filtered network stops the promise settling, permanently.
 *
 * Neither is ours to fix, and both have the same consequence for the reader —
 * the manual prompt that exists precisely for a model they cannot reach is on
 * the other side of a control that never finishes.
 *
 * A sentinel rather than a rejection, so the caller decides what a deadline
 * means. Here it is `failed`, the one reason of the four worth retrying.
 *
 * **Cancellation is not on offer.** `work` runs to completion or hangs forever;
 * this only stops *waiting* for it. Nothing downstream is harmed by a late
 * arrival — the reply is discarded — and a late rejection is still handled,
 * because `Promise.race` has attached to it whether or not it won.
 */
export async function within<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    // Cleared on the winning path as well as the losing one. A timer left
    // pending keeps a handle alive for its full duration — harmless in a
    // browser, and in Node it is the thing that stops a test run exiting.
    clearTimeout(timer);
  }
}
