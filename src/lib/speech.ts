import { useCallback, useEffect, useState } from 'react';

/**
 * The Web Speech API, which is the one browser capability this app cannot
 * assume — and which fails silently in four different ways.
 *
 * All four produce the same symptom: a button that looks fine and makes no
 * sound. Each is handled below and named where it is handled, because none of
 * them is visible from the call site.
 */

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/**
 * **Failure 1: the API exists, the voice does not.**
 *
 * `speechSynthesis` is present in every desktop browser, so its presence says
 * nothing. macOS ships Japanese as an *optional* voice — a machine that has
 * never had one installed exposes dozens of voices and no `ja-*` among them,
 * and `speak()` on an unmatched language does nothing at all.
 *
 * Some platforms report the tag with an underscore (`ja_JP`), which is why this
 * normalises before comparing rather than testing for `'ja-JP'`. It compares the
 * language subtag rather than the prefix, because `startsWith('ja')` also
 * accepts `jam` (Jamaican Creole) and would hand a Japanese word to it.
 */
export function japaneseVoices(available: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return available.filter(
    (voice) => voice.lang.replace('_', '-').toLowerCase().split('-')[0] === 'ja',
  );
}

/**
 * Prefers a voice that runs on the device.
 *
 * A network voice is silent whenever the connection is, and this is a drill
 * somebody may be doing on a train. macOS's Kyoko is local and better than the
 * remote alternatives for single words anyway.
 */
export function pickJapaneseVoice(
  available: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const candidates = japaneseVoices(available);
  return candidates.find((voice) => voice.localService) ?? candidates[0] ?? null;
}

/**
 * Everything worth trying, best first, ending in "let the browser decide".
 *
 * **`localService` does not mean playable.** macOS lists every system voice it
 * *could* use, downloaded or not — a Mac whose system language has never been
 * Japanese reports Kyoko and eight others as local, and none of them has any
 * audio data behind it. Chrome accepts such a voice, starts nothing and
 * reports nothing.
 *
 * That is why the network voice is in this list rather than being treated as a
 * poor relation: `Google 日本語` is served by the browser and depends on no
 * system download at all, so it is the one candidate that cannot be missing.
 * It is second rather than first because it needs a connection and a local
 * voice does not.
 *
 * The trailing `null` asks Chrome to resolve `ja-JP` itself, which occasionally
 * finds something the list does not describe.
 */
export function speechCandidates(
  available: readonly SpeechSynthesisVoice[],
): (SpeechSynthesisVoice | null)[] {
  const candidates = japaneseVoices(available);
  return [
    ...new Set([
      candidates.find((voice) => voice.localService) ?? null,
      candidates.find((voice) => !voice.localService) ?? null,
      null,
    ]),
  ];
}

export type SpeechStatus = 'unsupported' | 'loading' | 'no-japanese-voice' | 'ready' | 'failed';

/**
 * How long to wait for `start` before calling it silence.
 *
 * A local voice begins in tens of milliseconds; a network voice can take a
 * beat. Long enough not to accuse a slow engine, short enough that a learner
 * gets an explanation rather than sitting there pressing the button again.
 */
const START_TIMEOUT_MS = 2_000;

/** See failure 7 below: keeps the queued utterance from being collected. */
let speaking: SpeechSynthesisUtterance | null = null;

/**
 * The speech engine as this app needs it: a status the UI can explain, and a
 * `speak` that is safe to call twice in a row.
 *
 * **Failure 2: the voice list is populated asynchronously.** The first
 * `getVoices()` after page load returns `[]` in Chrome, and only a
 * `voiceschanged` event says otherwise. Deciding anything from that first empty
 * array — including "this machine has no Japanese" — is wrong for the first
 * few hundred milliseconds of every visit.
 */
export function useJapaneseSpeech(): { status: SpeechStatus; speak: (text: string) => void } {
  const [voices, setVoices] = useState<readonly SpeechSynthesisVoice[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const engine = synth();
    if (!engine) return;

    const read = () => setVoices(engine.getVoices());
    read();
    engine.addEventListener('voiceschanged', read);
    return () => {
      engine.removeEventListener('voiceschanged', read);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      const engine = synth();
      if (!engine || !text) return;
      setFailed(false);

      /**
       * One attempt, with or without an explicitly named voice.
       *
       * **Failure 8: a listed voice with nothing behind it.** macOS reports
       * every system voice it could use, downloaded or not, so `localService`
       * says where a voice would come from and not whether it can be heard.
       * An attempt that never starts therefore falls through to the next
       * candidate rather than being reported — see `speechCandidates` for the
       * order and why the network voice is in it.
       */
      const candidates = speechCandidates(voices);

      const attempt = (index: number) => {
        const voice = candidates[index] ?? null;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.85;
        if (voice) utterance.voice = voice;

        /**
         * **Failure 5: it goes quiet and reports nothing at all.** Chrome has
         * more than one way to swallow an utterance without firing `error` — a
         * wedged queue, a paused engine, the unusable voice above. Enumerating
         * them is a losing game; noticing that `start` never arrived is not.
         */
        const started = setTimeout(() => {
          if (index + 1 < candidates.length) {
            console.warn(
              `speechSynthesis: ${voice?.name ?? 'the default voice'} never started, trying the next candidate`,
            );
            attempt(index + 1);
            return;
          }
          console.error('speechSynthesis never started with any voice', {
            text,
            japaneseVoices: japaneseVoices(voices).map((item) => ({
              name: item.name,
              lang: item.lang,
              localService: item.localService,
            })),
          });
          setFailed(true);
        }, START_TIMEOUT_MS);

        utterance.onstart = () => clearTimeout(started);
        utterance.onend = () => {
          // Releases the reference taken below, once it can no longer matter.
          if (speaking === utterance) speaking = null;
        };
        utterance.onerror = (event) => {
          clearTimeout(started);
          // 'interrupted' and 'canceled' are this component doing its job —
          // moving to the next card while the previous word is still playing.
          if (event.error === 'interrupted' || event.error === 'canceled') return;
          console.error('speechSynthesis failed', event.error);
          setFailed(true);
        };

        /**
         * **Failure 6: a stuck `paused` engine.** Chrome leaves the synthesiser
         * paused after some cancels and after a spell in a background tab, and
         * a paused engine accepts `speak()`, queues it, plays nothing and
         * reports nothing. `resume()` on an engine that is not paused does
         * nothing, so this is unconditional rather than guarded on a flag that
         * is itself the thing being got wrong.
         */
        engine.resume();

        /**
         * **Failure 3: `cancel()` then `speak()` in the same task.** Chrome
         * drops the new utterance when both land in one turn of the event loop
         * — the queue is torn down after the call that filled it. Cancelling
         * only when something is actually playing, and letting the teardown
         * finish first, is what makes pressing the button twice work.
         */
        if (engine.speaking || engine.pending) {
          engine.cancel();
          setTimeout(() => engine.speak(utterance), 0);
        } else {
          engine.speak(utterance);
        }

        /**
         * **Failure 7: the utterance is collected before it is spoken.** Chrome
         * holds only a weak reference, so one that goes out of scope while
         * queued can be garbage-collected mid-sentence — silently, and only
         * under memory pressure, which is why it reproduces on one machine and
         * not another. Parking it here keeps it alive until the next call.
         *
         * Deliberately untested: no test can make a garbage collector run.
         */
        speaking = utterance;
      };

      attempt(0);
    },
    [voices],
  );

  const status: SpeechStatus = !synth()
    ? 'unsupported'
    : failed
      ? 'failed'
      : voices.length === 0
        ? 'loading'
        : japaneseVoices(voices).length === 0
          ? 'no-japanese-voice'
          : 'ready';

  return { status, speak };
}
