import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry } from '@/domain/entry';

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
  // Absent entries are dropped, never coerced to null: `?? null` deduped
  // against the trailing fallback, which promoted it to *first* on a machine
  // with no local Japanese voice — the exact machine the network voice is here
  // for, demoted behind the browser's own guess.
  return [
    candidates.find((voice) => voice.localService),
    candidates.find((voice) => !voice.localService),
    null,
  ].filter((voice) => voice !== undefined);
}

export type SpeechStatus = 'unsupported' | 'loading' | 'no-japanese-voice' | 'ready' | 'failed';

/**
 * Whether pressing the button can still produce a sound.
 *
 * `loading` counts, and that is the point of this being a function rather than
 * `status === 'ready'`: failure 2 below means the voice list is empty for the
 * first few hundred milliseconds of every visit, so a button gated on `ready`
 * is dead on first paint — on a page the reader arrives at already looking at
 * the word they want to hear.
 *
 * `failed` counts because the retry is the whole recovery: a press moves to the
 * next candidate voice, which is how a machine with a listed-but-undownloaded
 * voice ever reaches one that plays.
 *
 * Written as a list of what may speak rather than of what may not, so a status
 * added later has to be considered rather than silently inheriting a button.
 */
export function canSpeak(status: SpeechStatus): boolean {
  return status === 'ready' || status === 'loading' || status === 'failed';
}

/**
 * What the speech engine is asked to say.
 *
 * The kana reading wins over the written form when there is one. A TTS voice
 * guesses the reading of a kanji compound from context it does not have here —
 * a single word with no sentence around it — and 「辛い」 read as からい when
 * the note says つらい is the wrong word out loud, which in the dictation drill
 * also makes the answer unmarkable.
 */
export function spokenForm(entry: Pick<Entry, 'headword' | 'reading'>): string {
  return entry.reading || entry.headword;
}

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

  /** The backstop for the utterance in flight, so unmounting can drop it. */
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const engine = synth();
    if (!engine) return;

    /**
     * **Failure 10: a queue inherited from the previous page.**
     *
     * Chrome's synthesiser outlives the document that filled it. Navigating
     * away mid-utterance — or reloading during one — leaves the next page in
     * the same renderer looking at `speaking: true` with nothing playing, and
     * every `speak()` from then on joins a queue that never drains. It is why
     * the same build was mute on one tab and fine on another site in the same
     * browser, and why quitting Chrome outright appears to "fix" it.
     *
     * One `cancel()` before this page has queued anything of its own clears
     * whatever it inherited. It is a no-op on a clean engine.
     */
    engine.cancel();

    const read = () => setVoices(engine.getVoices());
    read();
    engine.addEventListener('voiceschanged', read);
    return () => {
      engine.removeEventListener('voiceschanged', read);
      /**
       * Leaving mid-utterance is the *other* half of failure 10. The mount-time
       * cancel above cleans up after a page unlucky enough to inherit a live
       * queue; this one stops handing the next page one. Quitting a session
       * while the word is still playing — 中断, Escape, or navigating off the
       * summary — is exactly that case.
       *
       * The backstop goes with it: after an unmount it can still fire, advance
       * the candidate and warn about a voice nobody is waiting for.
       */
      if (pending.current !== null) clearTimeout(pending.current);
      engine.cancel();
    };
  }, []);

  /**
   * Which candidate the next press will use.
   *
   * A ref, not state, because it must survive a re-render without causing one,
   * and because the value is read inside a callback that must stay stable.
   */
  const candidate = useRef(0);

  const speak = useCallback(
    (text: string) => {
      const engine = synth();
      if (!engine || !text) return;
      setFailed(false);

      const candidates = speechCandidates(voices);
      const voice = candidates[Math.min(candidate.current, candidates.length - 1)] ?? null;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.85;
      if (voice) utterance.voice = voice;

      /**
       * **Failure 5: it goes quiet and reports nothing at all.** Chrome has
       * more than one way to swallow an utterance without firing `error`.
       * Enumerating them is a losing game; noticing that `start` never arrived
       * is not.
       *
       * This only *reports*. It deliberately does not retry, because a
       * `speak()` from inside a timer has no user activation and can only fail
       * the same way — see below. What it does instead is move to the next
       * candidate, so the learner's next press tries a different voice.
       */
      const started = setTimeout(() => {
        pending.current = null;
        const next = candidate.current + 1;
        if (next < candidates.length) {
          candidate.current = next;
          console.warn(
            `speechSynthesis: ${voice?.name ?? 'the default voice'} never started; the next press will try ${
              candidates[next]?.name ?? 'the browser default'
            }`,
          );
        } else {
          console.error('speechSynthesis never started with any voice', {
            text,
            japaneseVoices: japaneseVoices(voices).map((item) => ({
              name: item.name,
              lang: item.lang,
              localService: item.localService,
            })),
          });
        }
        setFailed(true);
      }, START_TIMEOUT_MS);
      pending.current = started;

      const settle = () => {
        clearTimeout(started);
        if (pending.current === started) pending.current = null;
      };

      utterance.onstart = settle;
      utterance.onend = () => {
        // Releases the reference taken below, once it can no longer matter.
        if (speaking === utterance) speaking = null;
      };
      utterance.onerror = (event) => {
        settle();
        // 'interrupted' and 'canceled' are this component doing its job —
        // moving to the next card while the previous word is still playing.
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        console.error('speechSynthesis failed', event.error);
        setFailed(true);
      };

      /**
       * **Failure 6: a stuck engine.** `resume()` clears a synthesiser Chrome
       * left paused, and `cancel()` clears a queue it left occupied. Both are
       * cheap no-ops when nothing is wrong, and a wedged engine reports
       * `speaking: true` forever until they run.
       */
      engine.resume();
      if (engine.speaking || engine.pending) engine.cancel();

      /**
       * **Failure 9: user activation does not survive a timer.**
       *
       * Chrome has refused `speechSynthesis.speak()` outside a user gesture
       * since M71, and a refused call leaves the engine reporting
       * `speaking: true` with nothing playing — measured on the reporting
       * machine, where `speaking` was already true before any test ran and
       * `cancel()` could not clear it.
       *
       * So this call is synchronous inside the click that asked for it. An
       * earlier version deferred it by a tick to dodge the cancel-then-speak
       * race, which traded a race that costs one repeat for a policy that
       * costs every utterance.
       */
      engine.speak(utterance);

      /**
       * **Failure 7: the utterance is collected before it is spoken.** Chrome
       * holds only a weak reference, so one that goes out of scope while queued
       * can be garbage-collected mid-sentence — silently, and only under memory
       * pressure, which is why it reproduces on one machine and not another.
       *
       * Deliberately untested: no test can make a garbage collector run.
       */
      speaking = utterance;
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
