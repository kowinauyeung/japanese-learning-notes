import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimpleForm } from '@/components/entry-form/SimpleForm';
import type { EntryDraft } from '@/domain/entry';
import { I18nProvider } from '@/i18n/I18nProvider';
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
  onBusyChange = () => {},
}: {
  initial?: Partial<EntryDraft>;
  language?: string;
  onReply?: (raw: string) => void | Promise<void>;
  onFailure?: (reason: string) => void;
  onBusyChange?: (busy: boolean) => void;
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
      onBusyChange={onBusyChange}
      onReply={onReply}
      onFailure={onFailure}
    />
  );
}

const drawButton = () => screen.getByRole('button', { name: ja('import.draftAndSave') });

/**
 * Mount under `<StrictMode>` the way `main.tsx` does, and *not* through
 * `renderWithI18n`.
 *
 * The wrapper is the reason. Measured, after the first version of these two
 * tests passed against the very defect they were written for: with any element
 * outside it — `renderWithI18n` passes `wrapper`, which puts one there —
 * `<StrictMode>` does not double-invoke at all, and the effect sequence is a
 * single setup. A guard written against the double mount then passes
 * vacuously, which is worse than not having it.
 *
 * Outermost it double-invokes, including for a component that mounts in a later
 * update rather than on the first paint — also measured, because that is how
 * the dialog mounts and the guard would have been vacuous again otherwise.
 */
function renderStrict(ui: ReactElement) {
  return rtlRender(
    <StrictMode>
      <I18nProvider locale="ja">{ui}</I18nProvider>
    </StrictMode>,
  );
}

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

describe('SimpleForm — while the request is out', () => {
  /**
   * Every field, not only the two the prompt was built from.
   *
   * 意味・説明 is not in the prompt, so locking it reads as caution. It is not:
   * a successful draft overwrites that field and saves in the same tick, so a
   * sentence typed during the wait is written over and gone without ever having
   * been on screen beside what replaced it. The lock is what makes the
   * overwrite something the reader chose when they pressed the button.
   *
   * Asserted synchronously after the click, before the seeded rejection
   * settles in its microtask — the same shape `JsonImport.test.tsx` uses to
   * observe a request that is still out.
   */
  it('locks the meaning box too, which a successful draft is about to overwrite', () => {
    seedDrafting('failed');
    render(<Harness initial={{ headword: '兆候' }} />);

    fireEvent.click(drawButton());

    // Matched loosely because `Field` folds its hint into the accessible name —
    // 「見出し語必須」 — and which fields carry a hint is not what is under test.
    for (const label of [/見出し語/, /出典/, /訳の言語/, /意味・説明/]) {
      expect(screen.getByRole('textbox', { name: label })).toBeDisabled();
    }
  });

  it('reports the window upwards, which is what lets the modal lock its footer', async () => {
    const onBusyChange = vi.fn();
    seedDrafting('failed');
    render(<Harness initial={{ headword: '兆候' }} onBusyChange={onBusyChange} />);

    fireEvent.click(drawButton());
    // Without this call the modal never learns a request is out, so its footer's
    // 保存する stays pressable over a form this panel has already frozen — and
    // pressing it writes the note as it was a moment before the model answered.
    expect(onBusyChange).toHaveBeenCalledWith(true, expect.anything());

    // Without the second, that button never comes back: the reader is left with
    // a dialog they can only close.
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false, expect.anything()));
  });

  /**
   * The lock ends when the reply has been dealt with, not when it arrives.
   *
   * On this tab the handler imports the reply *and writes the note*, so a lock
   * that ended on invocation left the fields and the drafting button live while
   * `create` and `refresh` were still out. The reachable version was pressing
   * the button again — a second draft, a second save, and two entries for one
   * word.
   */
  it('stays locked while the reply is being saved, not only while it is awaited', async () => {
    let finish!: () => void;
    const onReply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Harness initial={{ headword: '兆候' }} onReply={onReply} />);

    fireEvent.click(drawButton());
    await waitFor(() => expect(onReply).toHaveBeenCalledTimes(1));

    // By its busy label, because that is what it reads while the lock holds —
    // and a label that had already gone back would be the defect itself.
    expect(screen.getByRole('button', { name: ja('import.generating') })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /見出し語/ })).toBeDisabled();

    finish();
    await waitFor(() => expect(drawButton()).toBeEnabled());
  });

  /**
   * The unlock is not guarded by the unmount check that guards everything else.
   *
   * The guard exists to stop a reply writing into a panel that is gone. The
   * modal is not gone — it is the thing being told — so skipping this when the
   * panel unmounts mid-request leaves its footer locked with nothing left on
   * its way to unlock it. Switching tabs is enough to reach that.
   */
  it('still unlocks the modal when the panel is gone before the reply lands', async () => {
    const onBusyChange = vi.fn();
    seedDrafting('failed');
    const { unmount } = render(
      <Harness initial={{ headword: '兆候' }} onBusyChange={onBusyChange} />,
    );

    fireEvent.click(drawButton());
    unmount();

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false, expect.anything()));
  });
});

describe('SimpleForm — under StrictMode, which is how the app actually runs in development', () => {
  /**
   * The reply still arrives after React has mounted the panel twice.
   *
   * `main.tsx` wraps the app in `<StrictMode>`, which in development mounts,
   * runs effects, runs their cleanups and runs them again. The unmount guard
   * was a cleanup with no setup, so it ended that sequence permanently false —
   * and every reply was then dropped with no import, no save, no message, and a
   * button stuck on 作成中, because the flag that clears it is behind the same
   * guard.
   *
   * Reported from a real session as "the API answered and the UI did not add
   * it", which is what a dropped reply looks like from outside. Production does
   * not double-invoke, so the only build this ever broke is the one the feature
   * is written in.
   */
  it('does not drop the reply after the double mount development runs under', async () => {
    const onReply = vi.fn();
    renderStrict(<Harness initial={{ headword: '兆候' }} onReply={onReply} />);

    fireEvent.click(drawButton());

    await waitFor(() => expect(onReply).toHaveBeenCalledTimes(1));
  });

  it('reports a refusal after the double mount too, rather than failing silently', async () => {
    // The other half of the same guard, and the reason the failure presented as
    // "no error" rather than as an error nobody could act on.
    const onFailure = vi.fn();
    seedDrafting('quota');
    renderStrict(<Harness initial={{ headword: '兆候' }} onFailure={onFailure} />);

    fireEvent.click(drawButton());

    await waitFor(() => expect(onFailure).toHaveBeenCalledWith('quota'));
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
