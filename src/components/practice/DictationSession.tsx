import { useEffect, useRef, useState } from 'react';
import { Ruby } from '@/components/Ruby';
import { SpeechStatusNote } from '@/components/SpeakButton';
import type { Entry } from '@/domain/entry';
import { INPUT_LIMITS } from '@/domain/limits';
import { useI18n } from '@/i18n/context';
import { entrySummary } from '@/lib/contentLang';
import { isCorrectAnswer } from '@/lib/dictation';
import { canSpeak, spokenForm, useJapaneseSpeech } from '@/lib/speech';
import { SessionHeader } from './SessionHeader';

/**
 * Hear the word, type it, then see whether it matched.
 *
 * Two things here are about the IME rather than about dictation, and both are
 * invisible until a Japanese keyboard is in front of it. See `handleKeyDown`
 * for the Enter key, and `lib/dictation.ts` for what counts as a match.
 */
export function DictationSession({
  entry,
  index,
  total,
  onAnswer,
  onQuit,
}: {
  entry: Entry;
  index: number;
  total: number;
  onAnswer: (correct: boolean) => void;
  onQuit: () => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const summary = entrySummary(entry);
  /** Null until 答え合わせ; the answer afterwards. */
  const [result, setResult] = useState<boolean | null>(null);

  /**
   * True while the IME is mid-conversion.
   *
   * `KeyboardEvent.isComposing` alone is not enough: it has been unreliable in
   * WebKit, and this is the one flag standing between "confirmed the candidate"
   * and "submitted 「かんじ」 as the answer to 漢字".
   */
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, speak } = useJapaneseSpeech();

  /**
   * Speak on arrival, so the drill starts by playing rather than by asking to.
   *
   * This was removed once, on the theory that Chrome's user-activation rule
   * made it unworkable, and putting it back is deliberate: Safari on the same
   * machine autoplays it correctly, so the feature is sound and Chrome is the
   * thing to work around — not the reason to drop it. The workaround lives in
   * `lib/speech.ts`, which clears the queue Chrome inherits from the previous
   * page before this one speaks.
   *
   * If it is refused anyway the utterance reports `not-allowed`, the hook shows
   * a message, and 単語を聞く still works because a click is a gesture.
   */
  const autoSpokenFor = useRef<string | null>(null);
  useEffect(() => {
    // Keyed on the card, not on the effect running. `status` is part of the
    // dependencies because arrival can precede the voice list, and it also
    // flips back to `ready` whenever the learner presses the button — without
    // this guard that press would be answered by two overlapping utterances.
    if (status === 'ready' && autoSpokenFor.current !== entry.id) {
      autoSpokenFor.current = entry.id;
      speak(spokenForm(entry));
    }
    inputRef.current?.focus();
  }, [entry, speak, status]);

  const check = () => {
    if (result !== null) return;
    setResult(isCorrectAnswer(typed, entry));
  };

  const next = () => {
    if (result === null) return;
    setTyped('');
    setResult(null);
    onAnswer(result);
  };

  /**
   * Enter means 答え合わせ, except while the IME owns it, and except on an
   * empty field.
   *
   * Pressing Enter to accept a conversion candidate is the single most common
   * keystroke in typing Japanese. Treating it as a submission marks the answer
   * against whatever was on screen mid-conversion — usually the kana — and the
   * learner never gets to type the word they were converting.
   *
   * On an empty field it replays the word instead. Enter there can only mean
   * "I did not catch that" — marking a blank answer wrong is a guaranteed
   * failure the learner never chose, and replaying is what they were reaching
   * for the mouse to do. It also keeps the whole drill on the keyboard, and the
   * keypress is a gesture, so this path can speak even where autoplay cannot.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    if (composing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (result !== null) next();
    else if (typed.trim() === '') speak(spokenForm(entry));
    else check();
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <SessionHeader title={t('practice.dictation')} index={index} total={total} onQuit={onQuit} />

      <div className="space-y-5 rounded-card bg-card p-6 shadow-panel">
        <div className="text-center">
          <button
            type="button"
            onClick={() => speak(spokenForm(entry))}
            disabled={!canSpeak(status)}
            className="min-h-12 rounded-pill bg-accent px-6 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {t('practice.listen')}
          </button>
          {/* Its own button rather than `SpeakButton`: the drill is the one
              screen where playing the word *is* the task, so it gets a labelled
              primary target instead of an icon beside a headword. */}
          <SpeechStatusNote status={status} className="mt-2" />
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] text-muted">{t('practice.heardWord')}</span>
          <input
            ref={inputRef}
            value={typed}
            readOnly={result !== null}
            maxLength={INPUT_LIMITS.dictationAnswer}
            onChange={(event) => setTyped(event.target.value)}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => (composing.current = false)}
            onKeyDown={handleKeyDown}
            // The IME needs to be on for this field; `lang` is the only hint a
            // browser takes for that.
            lang="ja"
            autoComplete="off"
            // `cjk-face` for the same reason as the `lang` above, one layer
            // on: the learner types Japanese into this field, and without it
            // their answer is drawn by the platform while the word they are
            // being asked to write sits beside it in the app's own face.
            className="cjk-face min-h-12 w-full rounded-panel border border-line bg-bg px-3 text-lg text-ink"
          />
        </label>

        {result !== null && (
          <div
            className={`space-y-2 rounded-panel p-4 ${result ? 'bg-accent-soft' : 'bg-danger-soft'}`}
          >
            <p className={`text-sm font-semibold ${result ? 'text-accent' : 'text-danger'}`}>
              {result ? t('practice.correct') : t('practice.incorrect')}
            </p>
            <Ruby
              headword={entry.headword}
              reading={entry.reading}
              className="has-ruby block font-display text-2xl font-bold [overflow-wrap:anywhere]"
            />
            <p className="prose-cjk text-sm" lang={summary.lang}>
              {summary.text}
            </p>
          </div>
        )}
      </div>

      {result === null ? (
        <button
          type="button"
          onClick={check}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          {t('practice.check')}
        </button>
      ) : (
        <button
          type="button"
          onClick={next}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          {t('practice.next')}
        </button>
      )}
    </section>
  );
}
