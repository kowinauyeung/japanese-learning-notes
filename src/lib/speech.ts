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

export type SpeechStatus = 'unsupported' | 'loading' | 'no-japanese-voice' | 'ready' | 'failed';

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

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.85;
      // Named explicitly rather than left to `lang`. Chrome matches a voice off
      // the language tag only when its list has loaded, and picks a system
      // default that may not be Japanese at all when it has not.
      const voice = pickJapaneseVoice(voices);
      if (voice) utterance.voice = voice;

      setFailed(false);
      utterance.onerror = (event) => {
        // 'interrupted' and 'canceled' are this component doing its job —
        // moving to the next card while the previous word is still playing.
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        console.error('speechSynthesis failed', event.error);
        setFailed(true);
      };

      /**
       * **Failure 3: `cancel()` then `speak()` in the same task.** Chrome drops
       * the new utterance when both land in one turn of the event loop — the
       * queue is torn down after the call that filled it. Cancelling only when
       * something is actually playing, and letting the teardown finish first,
       * is what makes pressing the button twice work.
       */
      if (engine.speaking || engine.pending) {
        engine.cancel();
        setTimeout(() => engine.speak(utterance), 0);
      } else {
        engine.speak(utterance);
      }
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
