import { describe, expect, it } from 'vitest';
import { japaneseVoices, pickJapaneseVoice } from '@/lib/speech';

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

describe('pickJapaneseVoice', () => {
  /**
   * A network voice is silent whenever the connection is, and this is a drill
   * somebody may be doing on a train.
   */
  it('prefers a voice that runs on the device over a network one', () => {
    const list = [voice('ja-JP', 'Google 日本語', false), voice('ja-JP', 'Kyoko', true)];
    expect(pickJapaneseVoice(list)?.name).toBe('Kyoko');
  });

  it('takes a network voice rather than none at all', () => {
    expect(pickJapaneseVoice([voice('ja-JP', 'Google 日本語', false)])?.name).toBe('Google 日本語');
  });

  it('returns null when nothing can read Japanese', () => {
    expect(pickJapaneseVoice(NO_JAPANESE)).toBeNull();
  });
});
