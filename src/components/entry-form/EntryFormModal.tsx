import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import type { Entry, EntryDraft } from '@/domain/entry';
import { ENTRY_LIMITS, TAG_INPUT_MAX } from '@/domain/limits';
import type { TranslationLanguage } from '@/domain/user';
import { useI18n } from '@/i18n/context';
import { localizeFormError } from '@/i18n/localizeFormError';
import { dateKey } from '@/lib/dates';
import { draftError, emptyDraft, parseTags, toDraft } from '@/lib/draft';
import { useEntries } from '@/lib/entries';
import { jsonToDraft } from '@/lib/jsonImport';
import { loadErrorMessage } from '@/lib/loadError';
import { EntryForm } from './EntryForm';
import { Area, Field, Text } from './fields';
import { emptyJsonImport, JsonImport } from './JsonImport';
import type { JsonImportState } from './JsonImport';

type Tab = 'simple' | 'full' | 'json';

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
  const { repository, syncAfterMutation } = useEntries();
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
   * Set by `loadJson` and therefore by all three routes — drafted here, pasted
   * from the clipboard, or loaded from a hand-filled box — because all three
   * are the JSON panel, and that panel exists to receive what an assistant
   * wrote.
   */
  const [fromModel, setFromModel] = useState(false);
  /**
   * The current `json`, readable from a callback that outlived the render it
   * was created in.
   *
   * `loadJson` reads `original` and `source` to build the import context, and
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
    setErrors([]);
  }, [open, entry, translationLanguage]);

  /**
   * Takes the text rather than reading `json.raw`, so the model's reply can be
   * imported in the same tick it arrives.
   *
   * `setJson` is asynchronous; calling this straight after it would parse the
   * *previous* paste — on the first draft, an empty one. Passing the text is
   * also what keeps the two routes on one implementation: there is no second
   * import path for the generated reply to drift away from.
   */
  const loadJson = (raw: string = json.raw) => {
    // Set here rather than only on the drafting button, because every route
    // into this function is an assistant's reply — the panel is labelled
    // 「AIが返したJSONを貼り付け」 and the footer button that calls this
    // renders only while that panel is open. Pasting one from a chatbot in
    // another tab is no less AI-written than fetching it from this one, so the
    // warning cannot depend on which button was pressed.
    setFromModel(true);
    const {
      draft: loaded,
      error: failure,
      oversize,
    } = jsonToDraft(raw, {
      original: jsonRef.current.original,
      source: jsonRef.current.source,
    });
    if (failure) return setErrors([localizeFormError(failure, t)]);
    // Deliberately not loaded and not truncated: the user is looking at the JSON
    // that produced these, so naming every field they have to shorten is both
    // actionable and the only way to avoid silently importing a note whose
    // explanation stops mid-sentence.
    if (oversize?.length) {
      return setErrors([
        t('import.oversizeTitle'),
        ...oversize.map((problem) => localizeFormError(problem, t)),
      ]);
    }
    setErrors([]);
    if (loaded) {
      setDraft(loaded);
      setTab('full');
    }
  };

  const save = async () => {
    // The clock is read here rather than inside `draftError`, which takes it as
    // an argument so it can be tested on any day — `learnedOn` is now bounded
    // above by today.
    const invalid = draftError(draft, dateKey(new Date()));
    if (invalid) return setErrors([localizeFormError(invalid, t)]);

    setSaving(true);
    setErrors([]);
    try {
      const id = entry
        ? (await repository.update(entry.id, draft), entry.id)
        : await repository.create(draft);
      await syncAfterMutation();
      onSaved?.(id);
      onClose();
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
              // Wrapped, not passed by reference: `loadJson` now takes the text
              // to import, and a bare handler would hand it the MouseEvent —
              // which `jsonToDraft` would dutifully try to parse.
              onClick={() => loadJson()}
              disabled={!json.raw.trim()}
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
            onClick={() => void save()}
            disabled={saving}
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
              onClick={() => {
                setTab(item.id);
                // `errors` carries both a JSON parse failure and a save failure.
                // Left alone, a malformed paste kept complaining from the footer
                // of the 詳細 tab, next to a 保存する it had nothing to do with.
                setErrors([]);
              }}
              className={`flex-1 rounded-pill py-1.5 text-xs font-semibold transition ${
                tab === item.id ? 'bg-card text-ink shadow-panel' : 'text-muted'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'simple' && !entry && (
        <div className="space-y-3">
          <Field label={t('form.headword')} hint={t('form.required')}>
            <Text
              value={draft.headword}
              onChange={(v) => setDraft({ ...draft, headword: v })}
              maxLength={ENTRY_LIMITS.headword}
            />
          </Field>
          <Field label={t('form.reading')} hint={t('form.kana')}>
            <Text
              value={draft.reading}
              onChange={(v) => setDraft({ ...draft, reading: v })}
              maxLength={ENTRY_LIMITS.reading}
            />
          </Field>
          <Field label={t('form.definition')} hint={t('form.required')}>
            <Area
              value={draft.definition}
              onChange={(v) => setDraft({ ...draft, definition: v })}
              maxLength={ENTRY_LIMITS.definition}
              rows={4}
            />
          </Field>
          <Field label={t('form.additionalNotes')} hint={t('form.optional')}>
            <Area
              value={draft.definitionSub}
              onChange={(v) => setDraft({ ...draft, definitionSub: v })}
              maxLength={ENTRY_LIMITS.definitionSub}
              rows={3}
            />
          </Field>
          <Field label={t('form.tags')} hint={t('form.tagsHint')}>
            <Text
              value={draft.tags.join(' ')}
              onChange={(v) => setDraft({ ...draft, tags: parseTags(v) })}
              maxLength={TAG_INPUT_MAX}
              placeholder={t('form.tagsPlaceholder')}
            />
          </Field>
          <p className="text-xs text-muted">{t('form.moreFields')}</p>
        </div>
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
        <JsonImport value={json} onChange={setJson} onDrafted={loadJson} />
      )}
    </Modal>
  );
}
