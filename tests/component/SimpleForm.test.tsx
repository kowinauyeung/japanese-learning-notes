import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimpleForm } from '@/components/entry-form/SimpleForm';
import type { EntryDraft } from '@/domain/entry';
import { messages } from '@/i18n/messages';
import { emptyDraft } from '@/lib/draft';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

afterEach(() => {
  delete (window as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__;
});

/** The seed the aliased `backend.e2e` port reads, installed per test. */
const seedDrafting = (entryDrafting: 'unavailable' | 'quota' | 'blocked' | 'failed') => {
  (window as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__ = { entryDrafting };
};

/** `renderWithI18n` mounts in Japanese, so `ja` is what reaches the DOM. */
const ja = (key: keyof (typeof messages)['ja']) => messages.ja[key];

function Harness({
  initial = {},
  language = '廣東話',
  onReply = () => {},
  onFailure = () => {},
}: {
  initial?: Partial<EntryDraft>;
  language?: string;
  onReply?: (raw: string) => void;
  onFailure?: (reason: string) => void;
}) {
  const [draft, setDraft] = useState<EntryDraft>({ ...emptyDraft(), ...initial });
  const [lang, setLang] = useState(language);
  return (
    <SimpleForm
      draft={draft}
      onChange={setDraft}
      language={lang}
      onLanguageChange={setLang}
      onAsk={() => {}}
      onReply={onReply}
      onFailure={onFailure}
    />
  );
}

const drawButton = () => screen.getByRole('button', { name: ja('import.draftAndSave') });

describe('SimpleForm — what arms the drafting button', () => {
  it('refuses to ask about nothing, which would send the model 「（単語）」 to define', () => {
    // `buildPrompt` substitutes a placeholder for an empty word rather than
    // refusing, so an unarmed button is the only thing between a stray tap and
    // a note about the word 「（単語）」.
    render(<Harness />);
    expect(drawButton()).toBeDisabled();
  });

  it('refuses to ask with the translation language cleared, which asks for a translation into 「」', () => {
    // The language is interpolated into the prompt as prose — 「"definitionSub"
    // と各 "translation" は◯◯で書いてください」 — so an empty one does not fail,
    // it asks for a translation into nothing and gets whatever the model picks.
    render(<Harness initial={{ headword: '兆候' }} language="" />);
    expect(drawButton()).toBeDisabled();
  });

  it('arms once both are present', () => {
    render(<Harness initial={{ headword: '兆候' }} />);
    expect(drawButton()).toBeEnabled();
  });
});

describe('SimpleForm — the inaccuracy warning', () => {
  /**
   * This tab is the one route where the warning has no second showing.
   *
   * The JSON tab repeats it beside the filled form, where a wrong reading is
   * visible; this button saves and leaves, so what is under it before the press
   * is the only time the reader is told. Rendering it only after a result would
   * put it on a screen nobody is on.
   */
  it('warns before the button is pressed, because pressing it saves and leaves', () => {
    render(<Harness initial={{ headword: '兆候' }} />);
    expect(screen.getByText(ja('import.aiDisclaimer'))).toBeInTheDocument();
  });
});

describe('SimpleForm — what it does with a reply', () => {
  it('hands the reply over verbatim instead of parsing it here', async () => {
    // A second parser here is what would let a bad reply through this door
    // while the JSON tab refused it. The modal runs both through `jsonToDraft`.
    const onReply = vi.fn();
    render(<Harness initial={{ headword: '兆候' }} onReply={onReply} />);

    fireEvent.click(drawButton());

    await waitFor(() => expect(onReply).toHaveBeenCalledTimes(1));
    const raw = onReply.mock.calls[0]?.[0] as string;
    expect(raw).toContain('```json');
    // Read back through the sanitiser's own coercion rather than an `any`
    // property access: what matters is that the word reached the model, and
    // the fence is asserted above.
    const reply = JSON.parse(raw.replace(/```json|```/g, '')) as { headword?: unknown };
    expect(reply.headword).toBe('兆候');
  });

  it('reports a refusal upwards rather than explaining it here, where the manual route is not', async () => {
    // There is no room under this button for the copy-the-prompt fallback, so
    // the reason goes to the modal, which moves the reader to the tab that has
    // one. A message rendered here would be a dead end with an explanation.
    const onFailure = vi.fn();
    seedDrafting('quota');
    render(<Harness initial={{ headword: '兆候' }} onFailure={onFailure} />);

    fireEvent.click(drawButton());

    await waitFor(() => expect(onFailure).toHaveBeenCalledWith('quota'));
    expect(screen.queryByText(ja('import.aiQuota'))).not.toBeInTheDocument();
  });
});
