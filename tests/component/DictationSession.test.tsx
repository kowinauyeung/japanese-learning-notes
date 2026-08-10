import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * The four ways `speechSynthesis` goes quiet, three of which shipped and were
 * found by using the app on a MacBook: the button was enabled, the click did
 * nothing, and nothing on screen said why.
 *
 * The engine is substituted here, which the rules allow — it is a browser
 * service, not a module we own — and it is the only way to reach these at all:
 * jsdom has no `speechSynthesis`, and a real browser has whichever voices that
 * machine happens to have installed.
 */
class FakeUtterance {
  lang = '';
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  // Declared rather than a parameter property: `erasableSyntaxOnly` rejects
  // the shorthand, since it emits code rather than erasing to nothing.
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}

const voice = (lang: string, name: string, localService = true) =>
  ({ lang, name, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

function installEngine(voices: SpeechSynthesisVoice[]) {
  const spoken: FakeUtterance[] = [];
  const engine = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
  };
  vi.stubGlobal('speechSynthesis', engine);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { engine, spoken };
}

describe('DictationSession — why the sound did not come out', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The reported defect. macOS ships Japanese as an *optional* voice, so a
   * machine that never installed one reports a full voice list with no `ja-*`
   * in it — and `speak()` on an unmatched language does nothing and reports
   * nothing. The old check only asked whether the API existed, which is always
   * true, so the button stayed enabled and silent forever.
   */
  it('says the Japanese voice is missing instead of failing silently', () => {
    installEngine([voice('en-US', 'Samantha')]);
    setup();

    expect(screen.getByRole('button', { name: /単語を聞く/ })).toBeDisabled();
    expect(screen.getByText(/日本語の音声が見つかりません/)).toBeInTheDocument();
  });

  /**
   * The card is silent until asked. Speaking from an effect was refused by
   * Chrome for want of a user gesture, and left the engine wedged — see
   * `DictationSession` for the measurement.
   */
  it('does not speak until the learner presses the button', () => {
    const { spoken } = installEngine([voice('ja-JP', 'Kyoko')]);
    setup();
    expect(spoken).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));
    expect(spoken.at(-1)?.text).toBe('ちょっと');
    expect(spoken.at(-1)?.voice?.name).toBe('Kyoko');
    expect(spoken.at(-1)?.lang).toBe('ja-JP');
  });

  /**
   * Chrome drops an utterance queued in the same task as `cancel()`, so the
   * old unconditional `cancel(); speak()` made the *second* press of
   * 単語を聞く silent — the one a learner reaches for precisely because they
   * did not catch the word.
   */
  /**
   * The second press has to reach the engine *inside* the click. Deferring it
   * by a tick to dodge Chrome's cancel-then-speak race was what lost the user
   * activation the same browser demands, so the utterance is queued
   * synchronously and the stale queue is cleared first.
   */
  it('speaks synchronously on a second press while the first word is playing', () => {
    const { engine, spoken } = installEngine([voice('ja-JP', 'Kyoko')]);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));
    expect(spoken).toHaveLength(1);

    engine.speaking = true;
    fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));

    expect(engine.cancel).toHaveBeenCalled();
    // No timer in between: a speak() from a timer has no user activation.
    expect(spoken).toHaveLength(2);
  });

  /** A refused utterance now reports itself instead of being indistinguishable
   *  from a working one that happened to be inaudible. */
  it('surfaces an engine error rather than leaving the learner guessing', () => {
    const { spoken } = installEngine([voice('ja-JP', 'Kyoko')]);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));

    act(() => {
      spoken.at(-1)?.onerror?.({ error: 'not-allowed' });
    });
    expect(screen.getByText(/音声を再生できませんでした/)).toBeInTheDocument();
  });
});

/**
 * The backstop, and the reason it exists: the reported failure came back a
 * second time as *no sound and no error at all*. Chrome has more than one way
 * to swallow an utterance without firing `error` — a wedged queue, a paused
 * engine, a voice the list offers but the platform cannot load — and
 * enumerating them is a losing game. Noticing that `start` never arrived
 * catches all of them, including the ones nobody has hit yet.
 */
describe('DictationSession — silence that reports nothing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /**
   * macOS lists Japanese voices that Chrome accepts and cannot load — the Siri
   * ones are not available to a third-party synthesiser at all. Which names
   * those are moves with each macOS release, so the chosen voice is dropped
   * and Chrome is asked to resolve `ja-JP` itself rather than guessed at.
   */
  const press = () => fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));

  /**
   * A silent attempt cannot be retried from the timer that noticed it: a
   * `speak()` with no user gesture behind it is refused, which is the defect
   * this whole file is about. So the next *press* moves to the next candidate
   * instead — the network voice being the one that cannot be a system voice
   * macOS never downloaded.
   */
  it('moves to the network voice on the next press, not from the timer', async () => {
    vi.useFakeTimers();
    const { spoken } = installEngine([
      voice('ja-JP', 'Kyoko'),
      voice('ja-JP', 'Google 日本語', false),
    ]);
    setup();

    press();
    expect(spoken[0]?.voice?.name).toBe('Kyoko');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    // Nothing spoken from the timer itself.
    expect(spoken).toHaveLength(1);
    expect(screen.getByText(/音声を再生できませんでした/)).toBeInTheDocument();

    press();
    expect(spoken[1]?.voice?.name).toBe('Google 日本語');
  });

  it('ends at the browser default and stays there', async () => {
    vi.useFakeTimers();
    const { spoken } = installEngine([
      voice('ja-JP', 'Kyoko'),
      voice('ja-JP', 'Google 日本語', false),
    ]);
    setup();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      press();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_500);
      });
    }

    expect(spoken.map((item) => item.voice?.name ?? null)).toEqual([
      'Kyoko',
      'Google 日本語',
      null,
      null,
    ]);
  });

  it('stays quiet about a slow engine that does eventually start', async () => {
    vi.useFakeTimers();
    const { spoken } = installEngine([voice('ja-JP', 'Kyoko')]);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      spoken.at(-1)?.onstart?.();
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.queryByText(/音声を再生できませんでした/)).not.toBeInTheDocument();
  });

  /**
   * A paused engine accepts `speak()`, queues it, plays nothing and reports
   * nothing. Chrome gets stuck that way after some cancels and after a spell
   * in a background tab.
   */
  it('resumes the engine before speaking, in case it is stuck paused', () => {
    const { engine } = installEngine([voice('ja-JP', 'Kyoko')]);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /単語を聞く/ }));
    expect(engine.resume).toHaveBeenCalled();
  });
});
