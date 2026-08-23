import { describe, expect, it } from 'vitest';
import { canSpeak, japaneseVoices, spokenForm, speechCandidates } from '@/lib/speech';

/**
 * Choosing a voice, which is the step that decides whether the dictation drill
 * makes a sound at all.
 *
 * `speechSynthesis` exists in every desktop browser and reports nothing when it
 * cannot honour a request, so every case here is one where the button looks
 * enabled and stays silent.
 */
const voice = (lang: string, name: string, localService = true) =>
  ({ lang, name, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

/** What a macOS machine with the Japanese voice never installed reports. */
const NO_JAPANESE = [voice('en-US', 'Samantha'), voice('en-GB', 'Daniel')];

describe('japaneseVoices', () => {
  it('finds ja-JP among a list dominated by other languages', () => {
    const list = [...NO_JAPANESE, voice('ja-JP', 'Kyoko')];
    expect(japaneseVoices(list).map((item) => item.name)).toEqual(['Kyoko']);
  });

  /**
   * Some platforms report the tag with an underscore. Testing for the literal
   * `'ja-JP'` finds nothing on those, and the drill goes quiet on exactly the
   * machines that do have a Japanese voice.
   */
  it.each(['ja_JP', 'JA-JP', 'ja'])('accepts the tag written as %s', (lang) => {
    expect(japaneseVoices([voice(lang, 'x')])).toHaveLength(1);
  });

  it('finds none when the machine has no Japanese voice installed', () => {
    expect(japaneseVoices(NO_JAPANESE)).toEqual([]);
  });

  /** `ja` must not match `jamo`, `java` or any other tag that starts with it. */
  it('does not match an unrelated tag that merely begins with ja', () => {
    expect(japaneseVoices([voice('jam-XX', 'Jamaican')])).toEqual([]);
  });
});

/**
 * The order attempts are made in, which is what decides whether the drill makes
 * a sound on a Mac that lists nine Japanese voices and can play none of them.
 */
describe('speechCandidates', () => {
  const KYOKO = voice('ja-JP', 'Kyoko', true);
  const GOOGLE = voice('ja-JP', 'Google 日本語', false);

  /**
   * The reported machine, exactly: nine local system voices and one network
   * voice. `localService` says where a voice *would* come from, not whether
   * macOS has ever downloaded it — so the network voice has to be reachable as
   * a fallback, not filtered out as second-rate.
   */
  it('tries the local voice, then the network one, then the browser default', () => {
    const list = [KYOKO, voice('ja-JP', 'Grandma (Japanese (Japan))'), GOOGLE];
    expect(speechCandidates(list).map((item) => item?.name ?? null)).toEqual([
      'Kyoko',
      'Google 日本語',
      null,
    ]);
  });

  it('does not repeat the browser default when there is no network voice', () => {
    expect(speechCandidates([KYOKO]).map((item) => item?.name ?? null)).toEqual(['Kyoko', null]);
  });

  it('still offers the default attempt when nothing Japanese is listed', () => {
    expect(speechCandidates([voice('en-US', 'Samantha')])).toEqual([null]);
  });

  /**
   * The case that got through: with no local voice, `?? null` produced a null
   * in the first slot that deduped against the trailing fallback, so the
   * browser's own guess was tried *before* the explicitly Japanese voice — on
   * exactly the machine the network voice exists for.
   */
  it('keeps the network voice ahead of the default when there is no local one', () => {
    const list = [voice('en-US', 'Samantha'), GOOGLE];
    expect(speechCandidates(list).map((item) => item?.name ?? null)).toEqual([
      'Google 日本語',
      null,
    ]);
  });
});

describe('spokenForm', () => {
  /**
   * A TTS voice reading 「辛い」 has no sentence to disambiguate from, so it
   * guesses — and a guess of からい is the wrong word out loud, which in the
   * dictation drill also makes つらい unanswerable.
   */
  it('speaks the kana reading rather than the kanji it could misread', () => {
    expect(spokenForm({ headword: '辛い', reading: 'つらい' })).toBe('つらい');
  });

  it('falls back to the headword when the word is already kana', () => {
    expect(spokenForm({ headword: 'ちょっと', reading: '' })).toBe('ちょっと');
  });
});

/**
 * Which statuses leave the button pressable. Both entries below are ones where
 * gating on `ready` alone produces a control that is dead when the reader wants
 * it: `loading` covers the few hundred milliseconds Chrome takes to populate
 * the voice list, and `failed` is the state a retry exists to escape.
 */
describe('canSpeak', () => {
  it.each(['ready', 'loading', 'failed'] as const)(
    'leaves the button pressable on %s',
    (status) => {
      expect(canSpeak(status)).toBe(true);
    },
  );

  it.each(['unsupported', 'no-japanese-voice'] as const)(
    'disables the button on %s, where a press could only be silent',
    (status) => {
      expect(canSpeak(status)).toBe(false);
    },
  );
});
