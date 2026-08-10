/**
 * The Web Speech API, behind two functions, because it is the one browser
 * capability this app cannot assume.
 *
 * `speechSynthesis` is missing entirely in some browsers and present-but-mute
 * in others (a headless Chromium ships the object with no voices installed).
 * Neither throws, so a component calling it directly would show an enabled
 * button that silently does nothing. `canSpeak()` is what lets the UI say so.
 */

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

export function canSpeak(): boolean {
  return synth() !== null;
}

/**
 * Speaks `text` in Japanese, cancelling anything already queued.
 *
 * Without the cancel, pressing 「もう一度聞く」 twice queues two utterances and
 * the second word starts before the first has finished — the queue is global to
 * the tab and outlives the component.
 *
 * Slightly under normal rate: this is a listening drill, and the default is
 * fast enough that a learner fails on speed rather than on vocabulary.
 */
export function speak(text: string): void {
  const engine = synth();
  if (!engine || !text) return;

  engine.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.85;
  engine.speak(utterance);
}
