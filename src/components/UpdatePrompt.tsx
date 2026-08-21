import { useState } from 'react';
import { useI18n } from '@/i18n/context';
import { useAppUpdate } from '@/lib/appUpdateContext';

/**
 * Offers the waiting build, and stays out of the way until there is one.
 *
 * **A banner and not a modal.** The reader is mid-something whenever this
 * arrives — that is the only time it can arrive — and a dialog that takes focus
 * would interrupt a dictation answer to talk about deployment. `role="status"`
 * with the default polite live region announces it at the next pause rather
 * than cutting in, which is the same decision expressed for screen readers.
 *
 * **Dismissal is per session, not remembered.** "Later" means later: the
 * banner returns on the next load, because `onWaiting` replays a build that is
 * still waiting rather than only reporting the transition. A dismissal that
 * persisted would leave a reader on an old build with nothing left to tell
 * them so, which is the state #68 exists to end.
 */
export function UpdatePrompt() {
  const { t } = useI18n();
  const { updateReady, activate } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateReady || dismissed) return null;

  return (
    <div
      role="status"
      // Centred, and placed by `BottomNotices` rather than here: clearing the
      // add button and clearing the offline pill are the same problem, and
      // solving half of it in this file is what produced an overlap at every
      // width that was eventually measured.
      className="pointer-events-auto w-full max-w-md self-center rounded-panel border border-line bg-card p-4 shadow-panel"
    >
      <p className="text-sm font-semibold text-ink">{t('update.available')}</p>
      <p className="prose-cjk mt-1 text-xs text-muted">{t('update.hint')}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="min-h-10 rounded-pill bg-bg-alt px-4 text-sm font-semibold text-ink"
        >
          {t('update.later')}
        </button>
        <button
          type="button"
          onClick={activate}
          className="min-h-10 rounded-pill bg-accent px-4 text-sm font-semibold text-on-accent"
        >
          {t('update.action')}
        </button>
      </div>
    </div>
  );
}
