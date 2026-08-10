import { useEffect, useRef, useState } from 'react';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';
import { isCorrectAnswer, spokenForm } from '@/lib/dictation';
import { canSpeak, speak } from '@/lib/speech';
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
  const [typed, setTyped] = useState('');
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

  // Speak on arrival, so the drill starts by playing rather than by asking to
  // play. The first utterance follows the 開始する click in the same document,
  // which is the gesture autoplay policies want.
  useEffect(() => {
    speak(spokenForm(entry));
    inputRef.current?.focus();
  }, [entry]);

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
   * Enter means 答え合わせ, except while the IME owns it.
   *
   * Pressing Enter to accept a conversion candidate is the single most common
   * keystroke in typing Japanese. Treating it as a submission marks the answer
   * against whatever was on screen mid-conversion — usually the kana — and the
   * learner never gets to type the word they were converting.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    if (composing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (result === null) check();
    else next();
  };

  const speakable = canSpeak();

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <SessionHeader title="書き取り練習" index={index} total={total} onQuit={onQuit} />

      <div className="space-y-5 rounded-card bg-card p-6 shadow-panel">
        <div className="text-center">
          <button
            type="button"
            onClick={() => speak(spokenForm(entry))}
            disabled={!speakable}
            className="min-h-12 rounded-pill bg-accent px-6 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            🔊 単語を聞く
          </button>
          {!speakable && (
            <p className="mt-2 text-xs text-danger">このブラウザは音声読み上げに対応していません</p>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] text-muted">聞こえた語</span>
          <input
            ref={inputRef}
            value={typed}
            readOnly={result !== null}
            onChange={(event) => setTyped(event.target.value)}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => (composing.current = false)}
            onKeyDown={handleKeyDown}
            // The IME needs to be on for this field; `lang` is the only hint a
            // browser takes for that.
            lang="ja"
            autoComplete="off"
            className="min-h-12 w-full rounded-panel border border-line bg-bg px-3 text-lg text-ink"
          />
        </label>

        {result !== null && (
          <div
            className={`space-y-2 rounded-panel p-4 ${result ? 'bg-accent-soft' : 'bg-danger-soft'}`}
          >
            <p className={`text-sm font-semibold ${result ? 'text-accent' : 'text-danger'}`}>
              {result ? '✅ 正解' : '❌ 不正解'}
            </p>
            <Ruby
              headword={entry.headword}
              reading={entry.reading}
              className="has-ruby block font-display text-2xl font-bold"
            />
            <p className="prose-cjk text-sm">{entry.senses[0]?.description || entry.definition}</p>
          </div>
        )}
      </div>

      {result === null ? (
        <button
          type="button"
          onClick={check}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          答え合わせ
        </button>
      ) : (
        <button
          type="button"
          onClick={next}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          次へ
        </button>
      )}
    </section>
  );
}
