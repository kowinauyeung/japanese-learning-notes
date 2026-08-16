import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpeakButton, SpeechStatusNote } from '@/components/SpeakButton';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * The pronunciation control on the word detail screens, where — unlike the
 * dictation drill — the button is an icon sitting beside the headword and there
 * is no surrounding text to explain it.
 *
 * Both claims here are about what a reader can perceive, which is why this is a
 * component test rather than a unit one: `canSpeak` decides the `disabled`
 * attribute and is covered in `tests/unit/speech.test.ts`, but neither the
 * accessible name nor the explanation is visible from that function.
 */
describe('SpeakButton', () => {
  /**
   * A speaker glyph with no label reaches a screen reader as "speaker high
   * volume, button" — the name of the picture, not of the action. The dictation
   * drill never had this problem because its button is labelled 単語を聞く in
   * text; this one has nothing but the emoji.
   */
  it('announces the action rather than the emoji it is drawn with', () => {
    render(<SpeakButton status="ready" onSpeak={vi.fn()} />);
    expect(screen.getByRole('button', { name: '発音を再生' })).toBeEnabled();
  });

  /**
   * `speechSynthesis` reports nothing when it cannot honour a request, so a
   * button left enabled on a machine with no Japanese voice is a control that
   * looks fine, makes no sound, and gives the reader nothing to act on.
   */
  it('cannot be pressed when no voice on this machine could answer it', () => {
    const onSpeak = vi.fn();
    render(<SpeakButton status="no-japanese-voice" onSpeak={onSpeak} />);

    // Queried without the name, so this goes red for the disabled state alone
    // and not also when the label above regresses.
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSpeak).not.toHaveBeenCalled();
  });
});

describe('SpeechStatusNote', () => {
  it('says why the press could not make a sound', () => {
    render(<SpeechStatusNote status="failed" />);
    expect(screen.getByText('音声を再生できませんでした。もう一度お試しください。')).toBeVisible();
  });

  /**
   * Chrome returns an empty voice list for the first few hundred milliseconds
   * of every visit, which is `loading` — and the word detail page is rendered
   * inside that window on every arrival. A note there accuses a browser that is
   * about to work, on a screen whose main content is not the audio.
   */
  it.each(['loading', 'ready'] as const)('stays silent on %s', (status) => {
    const { container } = render(<SpeechStatusNote status={status} />);
    expect(container).toBeEmptyDOMElement();
  });
});
