import { useEffect } from 'react';
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
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="bg-card shadow-panel flex max-h-[88vh] w-full flex-col rounded-t-3xl nav:max-h-[86vh] nav:max-w-2xl nav:rounded-3xl"
      >
        <div className="shrink-0 px-5 pt-3 nav:pt-5">
          <div className="bg-line mx-auto mb-3 h-1 w-10 rounded-full nav:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="hover:bg-bg-alt rounded-pill grid h-9 w-9 place-items-center text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && <div className="border-line shrink-0 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
