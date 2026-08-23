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
   * `failed` is the only status that arrives after a press rather than on
   * arrival, so it is the only one a screen reader has to be *told* about. A
   * live region that enters the document already carrying its text is not
   * reliably announced: the element has to be there first, empty, for the
   * sentence to land in.
   *
   * Node identity is the assertion because nothing else can see the
   * difference — a region created in the same commit as its message renders
   * byte-for-byte identically and stays silent out loud, so the reader presses
   * the button, hears nothing, and is told nothing.
   */
  it('fills a live region that was already on the page, not one created with the message', () => {
    const { container, rerender } = render(<SpeechStatusNote status="ready" />);
    const before = container.querySelector('[role="status"]');
    expect(before).not.toBeNull();

    rerender(<SpeechStatusNote status="failed" />);
    expect(container.querySelector('[role="status"]')).toBe(before);
    expect(before).toHaveTextContent('音声を再生できませんでした。もう一度お試しください。');
  });

  /**
   * Chrome returns an empty voice list for the first few hundred milliseconds
   * of every visit, which is `loading` — and the word detail page is rendered
   * inside that window on every arrival. A note there accuses a browser that is
   * about to work, on a screen whose main content is not the audio.
   *
   * The region stays; the sentence must not appear. It also carries no styling
   * class while empty, because the caller's `mt-2`/`mt-3` would otherwise open
   * a gap under every headword that has nothing to say.
   */
  it.each(['loading', 'ready'] as const)('shows no sentence on %s', (status) => {
    const { container } = render(<SpeechStatusNote status={status} className="mt-2" />);
    const region = container.querySelector('[role="status"]');
    expect(region).toBeEmptyDOMElement();
    expect(region).not.toHaveClass('mt-2');
  });
});
