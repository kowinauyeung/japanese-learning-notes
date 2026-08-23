import type { AppUpdatePort } from '@/domain/ports';
import { swUpdatePort } from '@/infra/pwa/updatePort';

/**
 * The end-to-end wiring with the real service worker left in.
 *
 * `vite build --mode e2e-pwa` aliases `./backend` here instead of to
 * `backend.e2e.ts`, and the only difference between the two is the last line.
 *
 * It has to be a separate module rather than a branch inside `backend.e2e.ts`,
 * because the fake `appUpdatePort` there is what keeps `@/infra/pwa/updatePort`
 * out of the graph entirely — and that module's top-level `registerSW()` is the
 * only registration in the app. So the ordinary `e2e` build has no worker no
 * matter what `pwa-config.ts` says: turning `disable` off changes what the build
 * *emits* and nothing ever asks the browser to install it.
 *
 * The trade runs the other way here: the `updateWaiting` seed cannot work in
 * this build, because the port answering it is the live one. That is why only
 * `offline.spec.ts` runs in this mode — the update prompt is laid out in
 * `notices.spec.ts` against the ordinary `e2e` build, where the seed still owns
 * the answer.
 */
export {
  authPort,
  entryDraftingPort,
  entryRepositoryFor,
  progressRepositoryFor,
  userRepository,
  wordSetRepositoryFor,
} from './backend.e2e';

export const appUpdatePort: AppUpdatePort = swUpdatePort;
