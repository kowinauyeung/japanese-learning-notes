import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!open) return;
    setDraft(entry ? toDraft(entry) : emptyDraft());
    setTab(entry ? 'full' : 'simple');
    setJson(emptyJsonImport(translationLanguage));
    setErrors([]);
  }, [open, entry, translationLanguage]);

  const loadJson = () => {
    const {
      draft: loaded,
      error: failure,
      oversize,
    } = jsonToDraft(json.raw, { original: json.original, source: json.source });
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
      await refresh();
      onSaved?.(id);
      onClose();
    } catch (cause) {
      console.error(cause);
      setErrors([t('form.saveError')]);
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
              onClick={loadJson}
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

      {tab === 'full' && <EntryForm draft={draft} onChange={setDraft} />}

      {tab === 'json' && !entry && <JsonImport value={json} onChange={setJson} />}
    </Modal>
  );
}
