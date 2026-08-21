import { registerSW } from 'virtual:pwa-register';
import type { AppUpdatePort } from '@/domain/ports';

/**
 * `AppUpdatePort` over the worker `vite-plugin-pwa` generates.
 *
 * `registerSW` is called once, at module load, and its return value is the only
 * way to move the waiting worker along. Registering a second time elsewhere
 * would produce a second updater whose `onNeedRefresh` fires into nothing,
 * which is why `injectRegister` is `false` in `pwa-config.ts`.
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
   * Called bare. The plugin's own signature names the parameter `_reloadPage`
   * and its type says it "is not used anymore" from 0.13.2 on — all
   * `updateServiceWorker` does is post `skipWaiting` to the waiting worker, so
   * passing `true` would have been a decoration that read like a control.
   *
   * The reload is real but it is not this call's, and not ours. When
   * `onNeedRefresh` fires, the plugin attaches a `controlling` listener; no
   * `onNeedReload` is passed above, so its default branch runs
   * `window.location.reload()` once the new worker takes control. Supplying
   * `onNeedReload` here would replace that default and leave the page on the
   * old build with a new worker underneath it — which is the stale state this
   * whole file exists to end.
   */
  activate: () => updateSW(),
};
