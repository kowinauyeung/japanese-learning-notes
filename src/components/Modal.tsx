import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Centred card on desktop, bottom sheet on phones — the add and edit flows open
 * over the current screen rather than navigating away, as the handoff specifies.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  /** Whether the gesture in progress started, and ended, on the backdrop. */
  const pressedOnBackdrop = useRef(false);
  const releasedOnBackdrop = useRef(false);

  /**
   * True while an IME is mid-conversion anywhere inside the dialog.
   *
   * Escape has two meanings on a Japanese keyboard, and the narrower one wins:
   * while a conversion is open it abandons the candidate and leaves the kana,
   * and only outside one does it mean "close this". Without the distinction,
   * backing out of a mistyped conversion in the add-word sheet also threw the
   * form away — one keystroke, two undos, and the second unasked for.
   *
   * `KeyboardEvent.isComposing` alone is not enough: it has been unreliable in
   * WebKit, which is why `DictationSession` guards its own Enter with both
   * signals. This is the same guard at the level Escape is listened on.
   */
  const composing = useRef(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (composing.current || event.isComposing) return;
      onClose();
    };
    // Composition events bubble, so one pair here covers every field the
    // dialog contains, including any a caller renders that this does not know
    // about.
    const onCompositionStart = () => {
      composing.current = true;
    };
    const onCompositionEnd = () => {
      composing.current = false;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('compositionstart', onCompositionStart);
    document.addEventListener('compositionend', onCompositionEnd);
    // Stop the page behind the sheet from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('compositionstart', onCompositionStart);
      document.removeEventListener('compositionend', onCompositionEnd);
      document.body.style.overflow = previous;
      // A dialog closed mid-conversion must not leave the next one deaf to
      // Escape: the compositionend that would have cleared this is delivered
      // to a field that no longer exists.
      composing.current = false;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 nav:items-center"
      /**
       * Dismissing needs a press *and* a release on the backdrop, not just a
       * release.
       *
       * A `click` is dispatched on the nearest common ancestor of where the
       * button went down and where it came up. Press inside the card, drag out
       * — selecting text, or overshooting a control — and release over the
       * backdrop, and the browser fires the click on this element: the card's
       * own handler never sees it, and the dialog closes on a gesture that was
       * never a click on the backdrop at all. On the add-word sheet that
       * discards whatever had been typed.
       *
       * **Both ends of the gesture are checked, not just one.** A first pass
       * tracked only where the press began, which left the mirror case wide
       * open: press on the backdrop, drag into the card, release. The click is
       * still dispatched here, the press really did start here, and the dialog
       * closed on a gesture that ended inside it — the same defect, with the
       * same worst case, in the other direction.
       *
       * **Three checks, and all three earn their place.** `target ===
       * currentTarget` refuses a click that merely bubbled up from the card,
       * which is what lets the card get away with not stopping propagation.
       * The two flags refuse a drag that crossed the boundary in either
       * direction.
       *
       * Dropping the target check once the flags existed looked safe and was
       * not: the flags describe the last *pointer* gesture, and a keyboard
       * activation fires a click with no pointer events before it, so they
       * still read as whatever preceded them. A backdrop dismissal leaves both
       * `true`, and this component stays mounted across `open={false}`, so the
       * next Enter pressed on any control inside the sheet closed it.
       *
       * Neither flag is cleared after use. Nothing needs it while the target
       * check stands, and a reset was tried once with no test able to fail on
       * it.
       */
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        releasedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!pressedOnBackdrop.current || !releasedOnBackdrop.current) return;
        onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-card shadow-panel nav:max-h-[86vh] nav:max-w-2xl nav:rounded-3xl"
      >
        <div className="shrink-0 px-5 pt-3 nav:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line nav:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="grid h-9 w-9 place-items-center rounded-pill text-lg hover:bg-bg-alt"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && <div className="shrink-0 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
