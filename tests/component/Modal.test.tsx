import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '@/components/Modal';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * Dismissing by backdrop, which every dialog in the app inherits.
 *
 * The defect: a `click` is dispatched on the nearest common ancestor of where
 * the button went down and where it came up. Pressing inside the card and
 * releasing over the backdrop — selecting a line of text, or overshooting a
 * control — therefore fires the click on the backdrop itself, and the dialog
 * closed on a gesture that was never a click on it. On the add-word sheet that
 * discarded whatever had been typed.
 *
 * The events below are fired the way a browser orders them, because that
 * ordering *is* the bug: jsdom will not retarget a click on its own, so a test
 * that clicked the backdrop directly would pass either way.
 */
const setup = () => {
  const onClose = vi.fn();
  render(
    <Modal open title="単語" onClose={onClose}>
      <input aria-label="見出し語" />
      <button type="button">タブ</button>
    </Modal>,
  );
  const backdrop = document.body.querySelector('[role="presentation"]');
  if (!backdrop) throw new Error('the backdrop is not rendered');
  return { onClose, backdrop, card: screen.getByRole('dialog') };
};

describe('Modal — focus stays in the active dialog', () => {
  it('moves focus into the first field when it opens', () => {
    setup();

    expect(screen.getByLabelText('見出し語')).toHaveFocus();
  });

  it('wraps Tab and Shift+Tab instead of reaching the page behind it', () => {
    setup();
    const close = screen.getByRole('button', { name: '閉じる' });
    const last = screen.getByRole('button', { name: 'タブ' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});

describe('Modal — dismissing by backdrop', () => {
  it('stays open when the press began inside the dialog', () => {
    const { onClose, backdrop, card } = setup();

    fireEvent.pointerDown(card);
    fireEvent.pointerUp(backdrop);
    // Released over the backdrop, so this is where the browser sends the click.
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * The mirror of the case above, and the one the first attempt at this let
   * through: the press really did start on the backdrop, so tracking only that
   * end passed it. The gesture still ended inside the card — a text selection
   * begun on the backdrop and finished in the add-word sheet — and closing on
   * it discards what had been typed just the same.
   */
  it('stays open when the release landed inside the dialog', () => {
    const { onClose, backdrop, card } = setup();

    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(card);
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the press and the release were both on the backdrop', () => {
    const { onClose, backdrop } = setup();

    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** A click on the card bubbles here; it is not a dismissal. */
  it('stays open when the dialog itself is clicked', () => {
    const { onClose, card } = setup();

    fireEvent.pointerDown(card);
    fireEvent.pointerUp(card);
    fireEvent.click(card);

    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * A click with no pointer events before it — the keyboard path.
   *
   * The two flags only mean anything about the gesture that set them, and a
   * keyboard activation sets neither: the browser fires a click with no
   * `pointerdown` or `pointerup` at all. A previous genuine backdrop dismissal
   * leaves both `true`, and the dialog stays mounted with `open={false}` so the
   * flags survive into the next opening. Without the target check — which was
   * dropped when the second flag was added, and which the card's removed
   * `stopPropagation` had been resting on — pressing Enter on any control
   * inside the sheet closed it and took the input with it.
   */
  it('stays open when a control inside it is activated from the keyboard', () => {
    const { onClose, backdrop } = setup();

    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Reopened, and activated from the keyboard: no pointer events, so neither
    // flag is refreshed and both still read as a backdrop gesture.
    fireEvent.click(screen.getByRole('button', { name: 'タブ' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * The flags follow the latest gesture rather than accumulating: a genuine
   * backdrop dismissal must not arm the next release, when that one began
   * inside the card.
   */
  it('does not let an earlier backdrop press arm a later drag out', () => {
    const { onClose, backdrop, card } = setup();

    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);

    fireEvent.pointerDown(card);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Escape has two meanings on a Japanese keyboard, and the narrower one wins:
 * while an IME conversion is open it abandons the candidate and leaves the
 * kana. Closing the dialog as well is one keystroke doing two undos, the second
 * unasked for — on the add-word sheet it threw the whole form away.
 *
 * Both signals are exercised because the guard reads both: `isComposing` on the
 * event, and a flag kept from the composition events, which is the backstop for
 * WebKit reporting the first unreliably.
 */
describe('Modal — Escape while an IME is converting', () => {
  it('stays open when the key event says a conversion is in progress', () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: 'Escape', isComposing: true });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open between compositionstart and compositionend', () => {
    const { onClose } = setup();
    const field = screen.getByLabelText('見出し語');

    fireEvent.compositionStart(field);
    // Deliberately without `isComposing`: this is the WebKit case, where the
    // flag is the only thing left saying a conversion is open.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes once the conversion has been committed', () => {
    const { onClose } = setup();
    const field = screen.getByLabelText('見出し語');

    fireEvent.compositionStart(field);
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape when nothing is being converted', () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
