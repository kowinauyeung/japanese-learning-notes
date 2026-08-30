import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import type { Entry, EntryDraft } from '@/domain/entry';
import type { EntryDraftingFailure } from '@/domain/ports';
import type { TranslationLanguage } from '@/domain/user';
import { useI18n } from '@/i18n/context';
import { localizeFormError } from '@/i18n/localizeFormError';
import { dateKey } from '@/lib/dates';
import { draftError, emptyDraft, toDraft } from '@/lib/draft';
import { useEntries } from '@/lib/entries';
import { jsonToDraft, type PromptContext } from '@/lib/jsonImport';
import { loadErrorMessage } from '@/lib/loadError';
import { EntryForm } from './EntryForm';
import { emptyJsonImport, JsonImport } from './JsonImport';
import type { JsonImportState } from './JsonImport';
import { SimpleForm } from './SimpleForm';
import type { DraftRequest } from './useEntryDrafting';

type Tab = 'simple' | 'full' | 'json';

/**
 * What an imported reply is for.
 *
 * `'form'` fills the form and leaves the reader in front of it — the JSON tab's
 * two buttons, where filling the form is the whole point of the tab. `'save'`
 * is the 簡易 tab's one button, which writes the note and leaves; the reader
 * reviews it on its detail page rather than in a twenty-field form they did not
 * ask to be in.
 *
 * Only the *successful* path differs. A reply that cannot be imported is
 * handled identically either way, because there is nothing to save and the JSON
 * tab is where a reply gets corrected.
 */
type ImportMode = 'form' | 'save';

/**
 * One modal for both adding and editing. Editing skips the tab switcher — the
 * quick-capture and paste-from-AI modes only make sense for a new note.
 */
export function EntryFormModal({
  open,
  entry,
  translationLanguage,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Present when editing; absent when adding. */
  entry?: Entry;
  /** Saved default for the JSON tab; the text field remains editable. */
  translationLanguage?: TranslationLanguage | null | undefined;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { refresh, repository } = useEntries();
  const { t } = useI18n();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'simple', label: t('form.simple') },
    { id: 'full', label: t('form.full') },
    { id: 'json', label: 'JSON' },
  ];
  const [tab, setTab] = useState<Tab>('simple');
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  /**
   * One or more messages. The JSON tab reports every oversize field at once —
   * see `jsonToDraft` — and a paste with six of them fixed one per round trip
   * is a paste nobody finishes fixing. Everything else still sets a single
   * entry, so the footer renders a list of one without looking like a list.
   */
  const [errors, setErrors] = useState<string[]>([]);
  /**
   * The JSON tab's fields live here rather than inside `JsonImport`, because
   * its 読み込む button is rendered into the modal footer and needs the pasted
   * text to act on.
   *
   * The button belongs there and not at the end of the panel: the paste box is
   * ten rows and the schema block above it expands, so anywhere inside the
   * scroll area puts the one control the tab exists to reach below the fold.
   * Two attempts to pin it with `position: sticky` failed differently — the
   * first left 32px of scrollable panel beneath it, the second parked it past
   * its own resting place so it slid 16px on the last of the scroll. The footer
   * is outside the scrollport and already `shrink-0`, so nothing about it moves.
   */
  const [json, setJson] = useState<JsonImportState>(() => emptyJsonImport(translationLanguage));
  /**
   * Whether what is in the form was written by a model rather than by the user.
   *
   * Held so the warning can be rendered beside the filled fields, which is
   * where a wrong reading or pitch accent is actually visible. Saying it only
   * on the button that fetched it would put the warning on the screen the user
   * has already left. Cleared when the modal reopens with the rest of the
   * state, and deliberately *not* cleared on edit: a form the user has
   * corrected two fields of is still mostly the model's work.
   *
   * Set by `importJson` and therefore by every route a reply arrives on —
   * drafted from either tab, pasted from the clipboard, or loaded from a
   * hand-filled box. Pasting one from a chatbot in another tab is no less
   * AI-written than fetching it from this one, so the flag cannot depend on
   * which button was pressed.
   *
   * The 簡易 tab sets it and never shows it: that route saves and leaves, so
   * there is no filled form to render the warning beside. Its warning is under
   * the button instead, which is the last screen the reader is on. This stays
   * true for that route rather than being special-cased, because a note whose
   * reader then presses 編集 lands on 詳細 — and it is the model's work there
   * for the same reason it is anywhere else.
   */
  const [fromModel, setFromModel] = useState(false);
  /**
   * Why the last drafting request failed, and whether it failed on a tab the
   * reader is no longer looking at.
   *
   * Both live here rather than in `JsonImport` because either tab can produce
   * the failure and only one of them can explain it: the 簡易 tab's button has
   * no room for the manual route underneath it, so a failure there moves the
   * reader to the JSON tab, which has. State held in the panel would be state
   * that unmounted on the way over.
   */
  const [aiError, setAiError] = useState<EntryDraftingFailure | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  /**
   * Whether a drafting request is out on whichever panel is open.
   *
   * The panels lock their own fields; this is what lets the dialog around them
   * lock too. Without it the footer's 保存する stayed live over a form the panel
   * had frozen — so the one control that could still change the note was the
   * one that wrote it, and pressing it saved whatever was there a moment before
   * the model answered.
   *
   * Reported by the panels rather than derived here, because the request can
   * settle after the panel that made it is gone — see `useEntryDrafting`.
   */
  const [drafting, setDrafting] = useState(false);
  /**
   * Which request the lock above belongs to.
   *
   * A request outlives the panel that made it and can outlive the whole dialog:
   * the close button stays live while one is out, and reopening starts a
   * second. Without this, the first settling unlocked the second — the footer's
   * save came back over a form a reply was still about to overwrite. Only the
   * request that took the lock may give it back.
   */
  const busyFor = useRef<DraftRequest | null>(null);
  const trackDrafting = (busy: boolean, request: DraftRequest) => {
    if (busy) {
      busyFor.current = request;
      setDrafting(true);
      return;
    }
    if (busyFor.current !== request) return;
    busyFor.current = null;
    setDrafting(false);
  };
  /**
   * The current `json`, readable from a callback that outlived the render it
   * was created in.
   *
   * `importJson` reads `original` and `source` for its default context, and
   * the panel calls it *after* an await — after a clipboard read that a browser
   * may have put its own confirmation in front of, for as long as the reader
   * takes to answer it. Through the closure those two fields were whatever they
   * held when the button was pressed, so a 出典 typed during the wait was
   * dropped from the entry that arrived. The `raw` half of the same defect was
   * fixed by passing the text as an argument; this is the other half, and it
   * cannot be an argument because the panel's own copy is stale in the same way.
   *
   * Written in an effect rather than during render: a ref assigned while
   * rendering is a mutation React does not promise to keep, and nothing here
   * reads it before paint.
   */
  const jsonRef = useRef(json);
  useEffect(() => {
    jsonRef.current = json;
  }, [json]);

  useEffect(() => {
    if (!open) return;
    setDraft(entry ? toDraft(entry) : emptyDraft());
    setTab(entry ? 'full' : 'simple');
    setJson(emptyJsonImport(translationLanguage));
    setFromModel(false);
    setAiError(null);
    setHandedOff(false);
    setDrafting(false);
    // The outstanding request, if there is one, is now nobody's: it may still
    // settle, and what it must not do on the way past is unlock this session.
    busyFor.current = null;
    setErrors([]);
  }, [open, entry, translationLanguage]);

  /**
   * Turn an assistant's reply into a note, and either show it or save it.
   *
   * Takes the text rather than reading `json.raw`, so the model's reply can be
   * imported in the same tick it arrives. `setJson` is asynchronous; calling
   * this straight after it would parse the *previous* paste — on the first
   * draft, an empty one. Passing the text is also what keeps every route on one
   * implementation: there is no second import path for a generated reply to
   * drift away from.
   *
   * `context` defaults to the ref rather than to `json` for the reason the ref
   * documents, and is passed explicitly by the 簡易 tab, whose 出典 is a field
   * on the draft and has never been in `json` at all.
   */
  const importJson = async (
    raw: string,
    mode: ImportMode = 'form',
    context: PromptContext = jsonRef.current,
  ) => {
    // Set here rather than only on the drafting buttons, because every route
    // into this function is an assistant's reply — the JSON panel is labelled
    // 「AIが返したJSONを貼り付け」 and the 簡易 button says it drafts with AI.
    // Pasting one from a chatbot in another tab is no less AI-written than
    // fetching it from this one, so the warning cannot depend on which button
    // was pressed.
    setFromModel(true);
    /*
      Unconditional, and it is the paste box's whole job.

      A reply that will not import has to stay on screen to be corrected, or
      the button that fetched it is also the button that threw it away — with
      the allowance already spent. `JsonImport.generate` used to do this itself
      and the move here dropped it for the tab it came from: the drafting
      button on the JSON panel refused a malformed reply into an empty box.

      Harmless on the routes that do not need it. The 読み込む button is
      importing what is already in the box, and the clipboard button has just
      written it, so both are setting the value they read.
    */
    setJson((prev) => ({ ...prev, raw }));
    const { draft: loaded, error: failure, oversize } = jsonToDraft(raw, context);

    /*
      A reply that arrived and could not be used is still a reply.

      It is in the paste box by now, whichever tab asked for it. What is left to
      decide is where the reader should be standing, and in `'save'` mode that
      is not where they are: the quick tab has nowhere to show a reply, so they
      are moved to the tab that does — where the message naming what is wrong
      with it is actionable, and where a fixed version can be imported by hand.

      Deliberately not `handedOff`: that flag says the model never answered and
      the manual prompt is now the way through. Here it answered, and telling
      someone to re-ask their own assistant about a reply whose 意味・説明 is
      forty characters too long is advice that walks them into the same wall.
    */
    const refuse = (messages: string[]) => {
      // The reply is in the box either way; this is only about where the reader
      // is standing. `'form'` mode was already on the panel that box is on.
      if (mode === 'save') setTab('json');
      setErrors(messages);
    };

    if (failure) return refuse([localizeFormError(failure, t)]);
    // Deliberately not loaded and not truncated: the user is looking at the JSON
    // that produced these, so naming every field they have to shorten is both
    // actionable and the only way to avoid silently importing a note whose
    // explanation stops mid-sentence.
    if (oversize?.length) {
      return refuse([
        t('import.oversizeTitle'),
        ...oversize.map((problem) => localizeFormError(problem, t)),
      ]);
    }
    setErrors([]);
    if (!loaded) return;

    setDraft(loaded);
    if (mode === 'form') return setTab('full');
    // `loaded`, not the state that was just set from it: `setDraft` is
    // asynchronous and `saveDraft` would otherwise write the draft as it was
    // before the import — on a first add, an empty one.
    /*
      A drafted note can import cleanly and still be refused by the save.

      `sanitizeDraft` deliberately does not bound the pitch accent against the
      reading — the comment there says the form owns that rule, "where it can be
      shown and corrected instead" — so a model answering 9 on a three-mora word
      passes the import and fails `draftError`. The quick tab has neither field,
      which left the reader looking at a sentence about an accent on a form with
      no accent on it. A refused save therefore lands where the rule can be
      obeyed, which is the same place the JSON tab's own drafts land.

      Every refusal, not only that one: a save that fails on the network is
      about a note the quick tab does not show either, and retrying from the
      filled form is the only version of that the reader can act on.
    */
    if (!(await saveDraft(loaded))) setTab('full');
  };

  /**
   * Write one draft, whichever route built it.
   *
   * Takes the draft rather than reading the state, because the drafting route
   * saves in the same tick it imports — see `importJson`.
   *
   * Answers whether the note was written. The footer ignores it — the errors it
   * needs are already on screen and it is already on the form — but the quick
   * tab's one-press route has to know, because a refusal there leaves the
   * reader on a tab that cannot show what was refused.
   */
  const saveDraft = async (target: EntryDraft): Promise<boolean> => {
    // The clock is read here rather than inside `draftError`, which takes it as
    // an argument so it can be tested on any day — `learnedOn` is now bounded
    // above by today.
    const invalid = draftError(target, dateKey(new Date()));
    if (invalid) {
      setErrors([localizeFormError(invalid, t)]);
      return false;
    }

    setSaving(true);
    setErrors([]);
    try {
      const id = entry
        ? (await repository.update(entry.id, target), entry.id)
        : await repository.create(target);
      await refresh();
      onSaved?.(id);
      onClose();
      return true;
    } catch (cause) {
      console.error(cause);
      // `permission-denied` here is a lockout, not a mistake in the draft —
      // #22 gave reads that distinction and #23 gives it to saves. Retrying
      // never clears it, which "保存できませんでした" reads as an invitation
      // to do.
      setErrors([
        loadErrorMessage(
          cause,
          t('form.saveError'),
          t('load.accessDenied'),
          t('load.unreachableSave'),
        ),
      ]);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={entry ? t('form.editTitle') : t('form.addTitle')}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          {errors.length > 0 && (
            <ul className="max-h-24 min-w-0 flex-1 space-y-0.5 overflow-y-auto text-xs text-danger">
              {errors.map((message) => (
                <li key={message} className="wrap-anywhere">
                  {message}
                </li>
              ))}
            </ul>
          )}
          {tab === 'json' && !entry && (
            <button
              type="button"
              // Wrapped, not passed by reference: `importJson` takes the text
              // to import, and a bare handler would hand it the MouseEvent —
              // which `jsonToDraft` would dutifully try to parse.
              onClick={() => void importJson(json.raw)}
              disabled={!json.raw.trim() || drafting}
              className="min-h-10 rounded-pill bg-bg-alt px-5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {t('form.import')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-10 rounded-pill bg-bg-alt px-5 text-sm font-semibold text-ink"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void saveDraft(draft)}
            disabled={saving || drafting}
            className="min-h-10 rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {saving ? t('form.saving') : t('form.save')}
          </button>
        </div>
      }
    >
      {!entry && (
        <div className="mb-5 flex gap-1 rounded-pill bg-bg-alt p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              // Locked while a request is out, because leaving the tab
              // unmounts the panel that made it and the reply is then dropped —
              // silently, and after the allowance has already been spent. The
              // close button stays live, which is the way out if it hangs.
              disabled={drafting}
              onClick={() => {
                setTab(item.id);
                // Chosen, not arrived at: the handoff notice explains why the
                // reader was moved here, and a reader who pressed the tab
                // themselves was not.
                setHandedOff(false);
                // `errors` carries both a JSON parse failure and a save failure.
                // Left alone, a malformed paste kept complaining from the footer
                // of the 詳細 tab, next to a 保存する it had nothing to do with.
                setErrors([]);
              }}
              className={`flex-1 rounded-pill py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                tab === item.id ? 'bg-card text-ink shadow-panel' : 'text-muted'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'simple' && !entry && (
        <SimpleForm
          draft={draft}
          onChange={setDraft}
          language={json.language}
          onLanguageChange={(next) => setJson((prev) => ({ ...prev, language: next }))}
          /* Copied into `json` at the press rather than kept in step with every
             keystroke, so there is one place either field is edited and no
             second copy to drift. What the JSON tab shows after a handoff is
             then exactly what was asked for, even if the reader kept typing
             while the request was out. */
          onBusyChange={trackDrafting}
          onAsk={() =>
            setJson((prev) => ({
              ...prev,
              word: draft.headword.trim(),
              source: draft.source,
            }))
          }
          onReply={(raw) => void importJson(raw, 'save', { source: draft.source })}
          onFailure={(reason) => {
            setAiError(reason);
            setHandedOff(true);
            setTab('json');
          }}
        />
      )}

      {tab === 'full' && (
        <>
          {/* Above the fields, not below them: the reader arrives here from the
              draft button and reads downwards, and a caution under a 20-field
              form is one nobody reaches before deciding the reading looks
              plausible. It stays for the life of the modal — see `fromModel`. */}
          {fromModel && (
            <p className="mb-3 rounded-panel border border-line px-3 py-2 text-[11px] text-muted">
              {t('import.aiDisclaimer')}
            </p>
          )}
          <EntryForm draft={draft} onChange={setDraft} />
        </>
      )}

      {tab === 'json' && !entry && (
        <JsonImport
          value={json}
          onChange={setJson}
          onDrafted={(raw) => void importJson(raw)}
          aiError={aiError}
          handedOff={handedOff}
          onBusyChange={trackDrafting}
          onFailure={(reason) => {
            setAiError(reason);
            setHandedOff(false);
          }}
        />
      )}
    </Modal>
  );
}
