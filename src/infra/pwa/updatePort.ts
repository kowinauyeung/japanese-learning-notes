import { registerSW } from 'virtual:pwa-register';
import type { AppUpdatePort } from '@/domain/ports';

/**
 * `AppUpdatePort` over the worker `vite-plugin-pwa` generates.
 *
 * `registerSW` is called once, at module load, and its return value is the only
 * way to move the waiting worker along. Registering a second time elsewhere
 * would produce a second updater whose `onNeedRefresh` fires into nothing,
 * which is why `injectRegister` is `null` in `vite.config.ts`.
 */

/**
 * Set before `registerSW` runs, because `onNeedRefresh` can fire during
 * registration when a worker is already waiting from a previous visit — the
 * reader who closed the tab yesterday and opened it today. A subscriber that
 * arrives after that would otherwise never hear about the build it is there to
 * announce.
 */
let waiting = false;
const listeners = new Set<() => void>();

const updateSW = registerSW({
  onNeedRefresh() {
    waiting = true;
    for (const listener of listeners) listener();
  },
});

export const swUpdatePort: AppUpdatePort = {
  onWaiting(fn) {
    listeners.add(fn);
    // Replays the state rather than only reporting transitions, for the case
    // above: by the time React has mounted, the event may already have passed.
    if (waiting) fn();
    return () => listeners.delete(fn);
  },
  /**
   * `true` is `reloadPage`. The worker calls `skipWaiting()` and the page is
   * reloaded once it has taken control, which is what makes the reload land on
   * the new build rather than re-serving the old one and looking like the
   * button did nothing.
   */
  activate: () => updateSW(true),
};
