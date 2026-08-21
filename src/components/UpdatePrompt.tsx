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
      // Bottom centre, above the add button rather than beside it: on a phone
      // the two would otherwise overlap, and the one that loses is the button
      // the reader was reaching for.
      //
      // The bottom offset does not yet read `env(safe-area-inset-bottom)`, so
      // on an installed iOS window this sits nearer the home indicator than it
      // should. That is #64, which covers every fixed element here at once —
      // this one and the add button already beside it.
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-panel border border-line bg-card p-4 shadow-panel nav:bottom-5"
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
