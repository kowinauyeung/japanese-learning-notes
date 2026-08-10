import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashcardSession } from '@/components/practice/FlashcardSession';
import { makeEntry } from '../fixtures/entry';

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
