import { useI18n } from '@/i18n/context';
import { useOnline } from '@/lib/useOnline';

/**
 * Offline as a state the interface shows, rather than a failure it reports.
 *
 * The distinction is the point of #63. `persistentLocalCache` means most reads
 * keep working with no network — the words are already on the device — so a
 * reader who is offline mostly sees an app that behaves normally, right up
 * until they open something that was never cached and get a sentence about the
 * thing they opened. Naming the state is what makes that legible before it
 * happens rather than after.
 *
 * **A quiet pill, not a banner.** Nothing is broken and nothing needs doing, so
 * this takes no action, blocks nothing, and does not move the page. Bottom left
 * keeps it clear of the add button at bottom right and of `UpdatePrompt`, which
 * is centred — the three can all be on screen at once and none of them is
 * allowed to cover another.
 *
 * `role="status"` for the same reason it is on `UpdatePrompt`: a polite live
 * region announces the change at the next pause instead of interrupting
 * whatever is being typed.
 */
export function OfflineNotice() {
  const { t } = useI18n();
  const online = useOnline();

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 left-5 z-40 max-w-[min(20rem,calc(100vw-2.5rem))] rounded-panel border border-line bg-card px-3 py-2 shadow-panel"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        {/* Decorative: the text beside it already names the state, and a screen
            reader announcing "circle" first would bury it. */}
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-pill bg-muted" />
        {t('offline.state')}
      </p>
      <p className="prose-cjk mt-0.5 text-xs text-muted">{t('offline.detail')}</p>
    </div>
  );
}
