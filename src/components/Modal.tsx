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
  /** Whether the gesture in progress started on the backdrop. See below. */
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // Stop the page behind the sheet from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
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
       * Both halves are checked. `pressed` says the gesture started here, and
       * `target === currentTarget` says it did not merely bubble up from the
       * card. That second check is why the card no longer needs to stop
       * propagation: a click on it is a click whose target is not this element.
       *
       * The flag is never cleared after use, because it never needs to be:
       * every click is preceded by a `pointerdown` that sets it afresh. Adding
       * a reset here was tried and no test could be made to fail on it.
       */
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!pressedOnBackdrop.current) return;
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
