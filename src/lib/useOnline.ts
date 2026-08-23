import { useSyncExternalStore } from 'react';

/**
 * Whether the browser believes it has a network.
 *
 * `useSyncExternalStore` rather than `useState` in an effect, because the
 * answer can change between render and commit — a tab restored from the
 * background frequently comes back already offline — and this hook has no
 * business rendering one answer and correcting it a frame later.
 *
 * **`navigator.onLine` is trustworthy in one direction only.** `false` means
 * there is definitely no network. `true` means there is a local connection, not
 * that anything is reachable through it: an airport portal, a router with no
 * uplink and a VPN dropping traffic all report `true`. That asymmetry is why
 * this drives an indicator and not an error path — the indicator is only ever
 * shown on the reliable answer, while what happens to a read that genuinely
 * fails is `loadError.ts`'s job and keyed on Firestore's own `unavailable`.
 *
 * `subscribe` and `getSnapshot` are module constants rather than inline
 * closures, so identity is stable and React does not resubscribe on render.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const getSnapshot = () => navigator.onLine;

/**
 * Server-side there is no navigator and nothing is offline. The app has no SSR
 * today; this keeps the hook from being the reason it could not.
 */
const getServerSnapshot = () => true;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
