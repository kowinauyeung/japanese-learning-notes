import { SparkleIcon } from '@/components/icons';
import type { EntryDraft } from '@/domain/entry';
import { ENTRY_LIMITS, INPUT_LIMITS } from '@/domain/limits';
import type { EntryDraftingFailure } from '@/domain/ports';
import { useI18n } from '@/i18n/context';
import { buildPrompt } from '@/lib/jsonImport';
import { Area, Field, Text } from './fields';
import { type DraftRequest, useEntryDrafting } from './useEntryDrafting';

/**
 * The quick-capture tab, and the app's shortest route to a finished note.
 *
 * It carries two ways out and they need different fields, so the fields are
 * grouped by the button that consumes them rather than by what they mean.
 * 見出し語 and 出典 sit above both groups because both paths use them; 訳の言語
 * belongs to the model and 意味・説明 belongs to the person, and a rule between
 * them is what makes that readable without a sentence explaining it. Written
 * out flat instead of shared with `EntryForm`: this tab exists precisely to not
 * be that form, and the moment the two share a field list one of them starts
 * growing the other's fields back.
 *
 * `読み方`, `補足` and `タグ` were here and are not any more. Everything the
 * model fills it fills better than a person typing at capture time, and
 * everything else is a keystroke between the reader and a saved note — the
 * remaining fields are reachable on 詳細 and after the save, which is what the
 * line at the bottom says.
 *
 * A component of its own rather than JSX inside `EntryFormModal`, because
 * `useEntryDrafting` guards on unmount and the modal does not unmount. See the
 * hook.
 */
export function SimpleForm({
  draft,
  onChange,
  language,
  onLanguageChange,
  onAsk,
  onBusyChange,
  onReply,
  onFailure,
}: {
  draft: EntryDraft;
  onChange: (next: EntryDraft) => void;
  /**
   * Lives in the modal's JSON state rather than in the draft, because it is not
   * a property of the note: it is what the prompt asks for, and the JSON tab
   * asks for the same thing. One value, so a reader who changes it here and
   * then falls back to that tab is not asked again.
   */
  language: string;
  onLanguageChange: (next: string) => void;
  /**
   * Called synchronously as the request goes out, so the modal can carry what
   * was asked over to the JSON tab in case the reader ends up there.
   */
  onAsk: () => void;
  /**
   * Whether a request is out, so the modal can lock its footer for as long as
   * this panel locks its fields. Reported rather than derived from `onAsk` and
   * `onReply`: a reply that arrives after this panel unmounts never reaches
   * either, and the footer would stay locked with nothing left to unlock it.
   *
   * Carries the request it is about, because one can outlive the dialog that
   * started it — see `useEntryDrafting`.
   */
  onBusyChange: (busy: boolean, request: DraftRequest) => void;
  /** The model's reply, verbatim. Parsed by the modal, never here. */
  onReply: (raw: string) => void;
  onFailure: (reason: EntryDraftingFailure) => void;
}) {
  const { t } = useI18n();
  const { available, drafting, draft: askForDraft } = useEntryDrafting(onBusyChange);
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) =>
    onChange({ ...draft, [key]: value });

  /*
    Both, not just the language. `buildPrompt` substitutes 「（単語）」 for an
    empty word, so a request sent without a headword is a request the model
    answers seriously — about a placeholder. The language has a default from the
    reader's settings and is therefore almost always filled, which makes the
    headword the condition that actually does the work here.
  */
  const canAsk = draft.headword.trim().length > 0 && language.trim().length > 0;

  const ask = () => {
    onAsk();
    void askForDraft(
      buildPrompt(draft.headword.trim(), language, {
        original: draft.context.original,
        source: draft.source,
      }),
      {
        onReply,
        onFailure,
      },
    );
  };

  /*
    Every field on this tab locks while the request is out, not only the two the
    prompt was built from.

    The narrower version was the one to justify: 意味・説明 is not in the prompt,
    so locking it looks like caution rather than a fix. It is a fix. A successful
    draft overwrites that field and saves in the same tick, so anything typed
    into it during the wait is written over and gone without ever having been on
    screen next to what replaced it — the reader watches their own sentence
    vanish into a note they did not write. The lock is what makes the overwrite
    something they chose when they pressed the button.
  */
  return (
    <div className="space-y-3">
      <Field label={t('form.headword')} hint={t('form.required')}>
        <Text
          value={draft.headword}
          onChange={(v) => set('headword', v)}
          maxLength={ENTRY_LIMITS.headword}
          disabled={drafting}
        />
      </Field>
      {/* Above 出典 because it is the field that changes what comes back:
          `buildPrompt` only asks for the context analysis when there is a
          sentence to analyse, and orders the senses by it. 出典 is copied
          through. Kept for the manual route too — `jsonToDraft` writes it into
          `context.original` either way, and a note is worth more with the
          sentence it was met in than without. */}
      <Field label={t('import.sentence')} hint={t('form.optional')}>
        <Area
          value={draft.context.original}
          onChange={(v) => set('context', { ...draft.context, original: v })}
          maxLength={ENTRY_LIMITS.context}
          rows={2}
          disabled={drafting}
          placeholder="あやしい兆候ではあるのだろうけれど"
        />
      </Field>
      {/* Only where the model can be reached: it is a statement about what the
          sentence buys from the draft, and the field is still worth filling
          without one — it just says nothing new then. */}
      {available && <p className="text-[11px] text-muted">{t('import.contextHint')}</p>}

      <Field label={t('form.source')} hint={t('form.optional')}>
        <Text
          value={draft.source}
          onChange={(v) => set('source', v)}
          maxLength={ENTRY_LIMITS.source}
          placeholder={t('form.sourcePlaceholder')}
          disabled={drafting}
        />
      </Field>

      {/* The whole group goes when the model cannot be reached, rather than a
          button that explains itself away when pressed. What is left is an
          ordinary two-field capture form, and the manual prompt on the JSON tab
          is the route in that case — the same reasoning `JsonImport` applies to
          its own drafting button. */}
      {available && (
        <div className="space-y-3 border-t border-line pt-4">
          <Field label={t('import.translationLanguage')}>
            <Text
              value={language}
              onChange={onLanguageChange}
              maxLength={INPUT_LIMITS.importLanguage}
              disabled={drafting}
            />
          </Field>
          <button
            type="button"
            onClick={ask}
            disabled={drafting || !canAsk}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {/* No hidden word beside it here, unlike the tab: the label below
                already says AI in every locale, so a second one would be read
                twice. */}
            <SparkleIcon />
            {drafting ? t('import.generating') : t('import.draftAndSave')}
          </button>
          {/* The only place this warning appears on this route. Pressing the
              button above saves and leaves, so there is no filled form to
              repeat it beside — which is why it is here, under the control that
              produces the result, and not somewhere the reader has already
              scrolled past. */}
          <p className="text-[11px] text-muted">{t('import.aiDisclaimer')}</p>
        </div>
      )}

      <div className="space-y-3 border-t border-line pt-4">
        <p className="text-[11px] font-semibold text-muted">{t('form.orWriteYourself')}</p>
        <Field label={t('form.definition')} hint={t('form.required')}>
          <Area
            value={draft.definition}
            onChange={(v) => set('definition', v)}
            maxLength={ENTRY_LIMITS.definition}
            rows={4}
            disabled={drafting}
          />
        </Field>
        <p className="text-xs text-muted">{t('form.moreFields')}</p>
      </div>
    </div>
  );
}
