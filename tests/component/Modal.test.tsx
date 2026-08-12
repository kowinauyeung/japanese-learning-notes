import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '@/components/Modal';

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
  const { container } = render(
    <Modal open title="単語" onClose={onClose}>
      <p>中身</p>
    </Modal>,
  );
  const backdrop = container.querySelector('[role="presentation"]');
  if (!backdrop) throw new Error('the backdrop is not rendered');
  return { onClose, backdrop, card: screen.getByRole('dialog') };
};

describe('Modal — dismissing by backdrop', () => {
  it('stays open when the press began inside the dialog', () => {
    const { onClose, backdrop, card } = setup();

    fireEvent.pointerDown(card);
    // Released over the backdrop, so this is where the browser sends the click.
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the press and the release were both on the backdrop', () => {
    const { onClose, backdrop } = setup();

    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** A click on the card bubbles here; it is not a dismissal. */
  it('stays open when the dialog itself is clicked', () => {
    const { onClose, card } = setup();

    fireEvent.pointerDown(card);
    fireEvent.click(card);

    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * The flag follows the latest press rather than accumulating: a genuine
   * backdrop dismissal must not arm the next release, when that one began
   * inside the card.
   */
  it('does not let an earlier backdrop press arm a later drag out', () => {
    const { onClose, backdrop, card } = setup();

    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    fireEvent.pointerDown(card);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
