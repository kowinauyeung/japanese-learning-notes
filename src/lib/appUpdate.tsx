import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AppUpdatePort } from '@/domain/ports';
import { AppUpdateContext } from './appUpdateContext';

/**
 * Whether a newer build is waiting, and the one action that takes it.
 *
 * **Why a prompt exists at all.** Before a service worker, a stale chunk fixed
 * itself: the next load fetched a new `index.html` and the new chunk names came
 * with it. Under a worker it does not. A controlled client keeps being served
 * the precached build until every tab on the origin has closed — so reloading,
 * the thing a reader will try and the thing a support reply would tell them,
 * is precisely the action that does not help. The worker cannot ship without
 * the thing that ends its own version.
 *
 * **Why the reader decides and not the app.** Activating on arrival would swap
 * the precached assets under a session already running, and the next lazily
 * imported route would come from a bundle the loaded code was not compiled
 * against. Mid-dictation that is a worse failure than the staleness it fixes:
 * it is unreproducible and it lands on whoever was busiest. The trade is that a
 * reader who ignores the prompt stays on the old build, which is the outcome
 * this is choosing on purpose — old and working beats new and halfway.
 *
 * The port is injected rather than imported so this module never names a
 * service worker. That is what lets a component test drive it with a real
 * implementation instead of a stub of ours.
 */
export function AppUpdateProvider({
  port,
  children,
}: {
  port: AppUpdatePort;
  children: ReactNode;
}) {
  const [updateReady, setUpdateReady] = useState(false);
  const [activateFailed, setActivateFailed] = useState(false);

  useEffect(() => {
    // `onWaiting` replays a build that was already waiting when this mounted,
    // so nothing is missed by subscribing after registration.
    return port.onWaiting(() => setUpdateReady(true));
  }, [port]);

  const activate = useCallback(() => {
    // Cleared up front rather than only on success, so a second click retries
    // cleanly instead of a transient failure staying on screen forever.
    setActivateFailed(false);
    port.activate().catch((error: unknown) => {
      // The page was never replaced, so this is the one place a failed
      // activation is observable at all — nothing else logs it.
      console.error('AppUpdateProvider: activation failed', error);
      setActivateFailed(true);
    });
  }, [port]);

  return (
    <AppUpdateContext.Provider value={{ updateReady, activate, activateFailed }}>
      {children}
    </AppUpdateContext.Provider>
  );
}
