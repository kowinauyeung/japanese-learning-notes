import { OfflineNotice } from './OfflineNotice';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * The two panels that report facts about the tab, in one stack that cannot
 * overlap itself.
 *
 * They used to position themselves independently — the prompt centred, the
 * notice bottom left — and a comment on each said it was clear of the other.
 * Measured across thirteen widths, that was false at every one of them:
 *
 * ```
 *  360: prompt/notice 320x8   notice/add 56x56
 *  700: prompt/notice 214x84
 * 1100: prompt/notice  14x84
 * 1128: clear
 * ```
 *
 * At 360 the offline pill covered the add button **entirely**, at `z-40` over
 * the button's `z-20` — so being offline took away the control the reader
 * reaches for most, which is the opposite of what a notice saying "your words
 * still work" is for. Above the `nav` breakpoint the prompt drops to
 * `bottom-5`, into the notice's band, and stays there until roughly 1128px:
 * every laptop width, not a corner case.
 *
 * Two independent `bottom` offsets cannot express "these never overlap" — the
 * arithmetic depends on the notice's height, which depends on how long the
 * sentence is in the reader's language. A stack expresses it structurally, so
 * a longer translation moves the prompt instead of colliding with it.
 *
 * `bottom-24` below the `nav` breakpoint is the add button's clearance, which
 * is why the whole stack carries it rather than the prompt alone. Above that
 * breakpoint the button is `nav:hidden` and `bottom-5` is free.
 *
 * `pointer-events-none` because the container spans the viewport: without it
 * the transparent gap between the two panels would swallow taps meant for the
 * page underneath — the add button among them.
 *
 * The bottom offset still does not read `env(safe-area-inset-bottom)`; that is
 * #64, and this stack is now the single place it has to be applied.
 */
export function BottomNotices() {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-40 flex flex-col gap-3 nav:bottom-5">
      {/* Above the prompt, which is the one with buttons on it: the reachable
          end of the stack belongs to the panel that asks for an action. */}
      <OfflineNotice />
      <UpdatePrompt />
    </div>
  );
}
