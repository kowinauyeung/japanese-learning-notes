import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DictationSession } from '@/components/practice/DictationSession';
import { makeEntry } from '../fixtures/entry';

/**
 * The defect this exists for: Enter is how a Japanese IME accepts a conversion
 * candidate, and it is also how this field submits. Without the composition
 * guard, typing 「ちょうこう」 and pressing Enter to convert it to 兆候 marks
 * the answer against the kana that was on screen mid-conversion — the learner
 * never gets to finish the word, and the drill is unusable on the only keyboard
 * it is for.
 *
 * Reproducing that needs the composition events, because that is the only
 * signal distinguishing the two meanings of the key. jsdom fires nothing on its
 * own; a real IME emits compositionstart, then keydown with `isComposing`, then
 * compositionend.
 *
 * `entry` here is deliberately kana-only, so the *unguarded* behaviour would
 * score the mid-composition text as correct. A guard that fired on the wrong
 * event would then flip a passing assertion, which a kanji headword — wrong
 * either way — could not tell apart.
 */
const entry = makeEntry({ id: 'e1', headword: 'ちょっと', reading: '' });

const setup = () => {
  const onAnswer = vi.fn();
  render(
    <DictationSession entry={entry} index={0} total={3} onAnswer={onAnswer} onQuit={vi.fn()} />,
  );
  return { onAnswer, input: screen.getByLabelText('聞こえた語') };
};

/** One IME conversion: the candidate is accepted, and the field is left changed. */
function pressEnterDuringComposition(input: HTMLElement) {
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
}

describe('DictationSession — the IME Enter key', () => {
  it('does not mark the answer when Enter is accepting a conversion candidate', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'ちょっと' } });

    pressEnterDuringComposition(input);

    // Still waiting for the learner: no verdict, and the field is still theirs.
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '答え合わせ' })).toBeInTheDocument();
  });

  it('marks the answer on the Enter that follows compositionend', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'ちょっと' } });

    pressEnterDuringComposition(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('✅ 正解')).toBeInTheDocument();
  });

  /**
   * The second Enter advances rather than re-marking. Without the `result !==
   * null` branch, holding Enter down would answer and advance in one keypress
   * and the learner would never see the word they got wrong.
   */
  it('advances on the next Enter instead of marking the same card twice', () => {
    const { input, onAnswer } = setup();
    fireEvent.change(input, { target: { value: 'ちがう' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('❌ 不正解')).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe('DictationSession — speech', () => {
  /**
   * jsdom has no `speechSynthesis`, which is the same situation as a browser
   * that does not implement it. The button must say so rather than sit there
   * enabled and silent.
   */
  it('disables 単語を聞く and says why when the browser cannot speak', () => {
    setup();
    expect(screen.getByRole('button', { name: /単語を聞く/ })).toBeDisabled();
    expect(screen.getByText('このブラウザは音声読み上げに対応していません')).toBeInTheDocument();
  });
});
