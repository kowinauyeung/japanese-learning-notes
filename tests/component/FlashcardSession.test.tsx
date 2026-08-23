import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '@/components/Modal';
import { FlashcardSession } from '@/components/practice/FlashcardSession';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * The keyboard shortcuts, which are the only way this card is meant to be
 * driven once a learner is a few words in.
 *
 * They are bound on `document`, not on a focused element, so nothing in the DOM
 * shows they exist and nothing but a test can tell whether they still do. The
 * one that carries a real rule is the arrow keys: they must stay inert until
 * the card is flipped, the same as the buttons that are not rendered yet.
 */
const entry = makeEntry({ id: 'e1', headword: '兆候', reading: 'ちょうこう' });

const setup = (props: Partial<Parameters<typeof FlashcardSession>[0]> = {}) => {
  const onAnswer = vi.fn();
  const onQuit = vi.fn();
  render(
    <FlashcardSession
      entry={entry}
      index={0}
      total={3}
      onAnswer={onAnswer}
      onQuit={onQuit}
      {...props}
    />,
  );
  return { onAnswer, onQuit };
};

const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(document, { key, ...init });

describe('FlashcardSession — keyboard', () => {
  it('turns the card on Space, and turns it back', () => {
    setup();
    expect(screen.queryByRole('button', { name: /わかった/ })).not.toBeInTheDocument();

    press(' ');
    expect(screen.getByRole('button', { name: /わかった/ })).toBeInTheDocument();

    press(' ');
    expect(screen.queryByRole('button', { name: /わかった/ })).not.toBeInTheDocument();
  });

  /**
   * The defect: answering a card whose meaning is still hidden records
   * confidence rather than recall, and 苦手な語 is built out of these answers.
   * The buttons enforce it by not existing yet; a document-level shortcut has
   * to enforce it itself.
   */
  it('ignores the arrow keys until the meaning is on screen', () => {
    const { onAnswer } = setup();

    press('ArrowRight');
    press('ArrowLeft');
    expect(onAnswer).not.toHaveBeenCalled();

    press(' ');
    press('ArrowRight');
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('answers もう一度 on ArrowLeft', () => {
    const { onAnswer } = setup();
    press(' ');
    press('ArrowLeft');
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false);
  });

  /** A held key repeats, and a repeated answer tears through the queue. */
  it('ignores an auto-repeat, so a held arrow answers one card', () => {
    const { onAnswer } = setup();
    press(' ');
    press('ArrowRight', { repeat: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  /** Ctrl+← is "back" in a browser, not "もう一度". */
  it('leaves a modified arrow to the browser', () => {
    const { onAnswer } = setup();
    press(' ');
    press('ArrowLeft', { metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('asks to leave on Escape', () => {
    const { onQuit } = setup();
    press('Escape');
    expect(onQuit).toHaveBeenCalledOnce();
  });

  /**
   * With the quit dialog open, the Escape that closes it would otherwise be
   * caught here as well and reopen it on the way back — a dialog that cannot
   * be dismissed with the key that opened it.
   */
  it('stops listening while a dialog is over the card', () => {
    const { onQuit, onAnswer } = setup({ keyboard: false });
    press('Escape');
    press(' ');
    expect(onQuit).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('FlashcardSession — shortcut hints', () => {
  it('prints the key on each button it belongs to', () => {
    setup();
    expect(screen.getByRole('button', { name: /裏を見る/ })).toHaveTextContent('Space');

    press(' ');
    expect(screen.getByRole('button', { name: /もう一度/ })).toHaveTextContent('←');
    expect(screen.getByRole('button', { name: /わかった/ })).toHaveTextContent('→');
  });

  /** 中断 is deliberately bare: it is a header control, not a drill action. */
  it('leaves 中断 without one', () => {
    setup();
    expect(screen.getByRole('button', { name: '中断' })).toHaveTextContent('中断');
  });
});

describe('FlashcardSession — long secondary text', () => {
  it('hard-wraps the secondary definition and example translation inside the card', () => {
    const secondary = `secondary-${'W'.repeat(500)}`;
    const translation = `translation-${'W'.repeat(500)}`;

    setup({
      entry: makeEntry({
        id: 'long-secondary',
        definitionSub: secondary,
        senses: [
          {
            label: 'long example',
            description: 'meaning',
            example: '例文',
            exampleGloss: '例文の意味',
            translation,
            usage: 'test',
          },
        ],
      }),
    });

    press(' ');

    expect(screen.getByText(secondary, { selector: 'p' })).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByText(translation, { selector: 'p' })).toHaveClass(
      '[overflow-wrap:anywhere]',
    );
  });
});

/**
 * The card under an overlay it was never told about.
 *
 * `AppLayout` renders ＋追加 and the mobile ＋ button on every route,
 * `/practice/:mode` included, so the add-word sheet can be open over a running
 * card while `FlashcardSession` still has `keyboard` true — it only knows
 * about the quit dialog its own parent renders. A document-level listener then
 * reads every keystroke meant for the form.
 *
 * Composed from the real `Modal` rather than a stand-in, because the claim is
 * about how the two behave together: `Modal` binds its own Escape on
 * `document` and stops nothing else.
 */
function renderWithModal() {
  const onAnswer = vi.fn();
  const onQuit = vi.fn();
  const onClose = vi.fn();
  render(
    <>
      <FlashcardSession entry={entry} index={0} total={3} onAnswer={onAnswer} onQuit={onQuit} />
      <Modal open title="単語を追加" onClose={onClose}>
        <label>
          見出し語
          <input />
        </label>
      </Modal>
    </>,
  );
  return { onAnswer, onQuit, onClose, field: screen.getByLabelText('見出し語') };
}

describe('FlashcardSession — under the add-word sheet', () => {
  /**
   * The worst of the three: the card is scored without ever being seen, the
   * queue advances behind the sheet, and the answer is written into 苦手な語.
   */
  it('does not answer the card when an arrow key is typed into a form field', () => {
    const { onAnswer } = renderWithModal();
    press(' ');

    fireEvent.keyDown(screen.getByLabelText('見出し語'), { key: 'ArrowRight', bubbles: true });

    expect(onAnswer).not.toHaveBeenCalled();
  });

  /** `preventDefault` on the session's behalf means the space is never typed. */
  it('lets a space reach the form field instead of swallowing it', () => {
    const { field } = renderWithModal();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    field.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  /** Escape closes the sheet; it must not also open the quit dialog behind it. */
  it('does not ask to quit when Escape dismisses the sheet', () => {
    const { onQuit, onClose } = renderWithModal();

    press('Escape');

    expect(onClose).toHaveBeenCalled();
    expect(onQuit).not.toHaveBeenCalled();
  });

  /** Focus outside the field is still inside a modal, and still not the card's. */
  it('ignores the keyboard while a dialog is open even with focus outside its fields', () => {
    const { onAnswer } = renderWithModal();
    press(' ');
    press('ArrowRight');

    expect(onAnswer).not.toHaveBeenCalled();
  });
});
