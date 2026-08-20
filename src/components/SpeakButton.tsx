import { useI18n } from '@/i18n/context';
import { canSpeak, type SpeechStatus } from '@/lib/speech';

/**
 * Hearing a word, on any screen that shows one.
 *
 * The engine itself lives in `lib/speech.ts` and the hook stays at the call
 * site rather than inside this button, for two reasons. The dictation drill
 * needs `speak` for things that are not a press — the card speaking on arrival,
 * and Enter on an empty field replaying it — and a second `useJapaneseSpeech()`
 * inside the button would give that screen two engines racing over one
 * synthesiser. And `status` decides what the *page* says, not just what the
 * button does, so the explanation below is a separate element the caller places
 * where there is room for a sentence.
 */

/**
 * A press that plays the word, and nothing on screen that lies about it.
 *
 * The disabled state is the point: `speechSynthesis` exists in every desktop
 * browser and stays silent when it cannot honour the request, so a button left
 * enabled on a machine with no Japanese voice is a control that looks fine and
 * does nothing. Pair it with `SpeechStatusNote`, which says why.
 */
export function SpeakButton({
  status,
  onSpeak,
  className = '',
}: {
  status: SpeechStatus;
  onSpeak: () => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onSpeak}
      disabled={!canSpeak(status)}
      // The label is on the button rather than beside the icon: a speaker
      // glyph alone reaches a screen reader as "speaker high volume", which
      // names the picture and not the action.
      aria-label={t('speech.pronounce')}
      title={t('speech.pronounce')}
      className={`grid size-9 shrink-0 place-items-center rounded-pill bg-bg-alt text-base text-ink disabled:opacity-60 ${className}`}
    >
      🔊
    </button>
  );
}

/**
 * Why the button is disabled, or why the press made no sound.
 *
 * Silent on `ready` and on `loading`: neither is something to explain, and a
 * message during the few hundred milliseconds the voice list takes to arrive
 * would accuse a browser that is about to work.
 *
 * Silent, but present. `failed` is the one status that arrives *after* a press,
 * and a live region inserted into the document already carrying its text is not
 * reliably announced — so the paragraph is rendered on every status and the
 * sentence lands in an element the reader's screen reader has been watching
 * since the page loaded.
 */
export function SpeechStatusNote({
  status,
  className = '',
}: {
  status: SpeechStatus;
  className?: string;
}) {
  const { t } = useI18n();

  const message =
    status === 'unsupported'
      ? t('speech.unsupported')
      : status === 'no-japanese-voice'
        ? t('speech.voiceMissing')
        : status === 'failed'
          ? t('speech.error')
          : null;

  // The caller's spacing goes on only when there is something to space: an
  // empty paragraph carrying `mt-2` would open a gap under every headword the
  // synthesiser has no complaint about.
  return (
    <p role="status" className={message === null ? undefined : `text-xs text-danger ${className}`}>
      {message}
    </p>
  );
}
