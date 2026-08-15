import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import type { Entry, EntryDraft } from '@/domain/entry';
import type { TranslationLanguage } from '@/domain/user';
import { draftError, emptyDraft, parseTags, toDraft } from '@/lib/draft';
import { useEntries } from '@/lib/entries';
import { jsonToDraft } from '@/lib/jsonImport';
import { EntryForm } from './EntryForm';
import { Area, Field, Text } from './fields';
import { emptyJsonImport, JsonImport } from './JsonImport';
import type { JsonImportState } from './JsonImport';

type Tab = 'simple' | 'full' | 'json';

const TABS: { id: Tab; label: string }[] = [
  { id: 'simple', label: '簡単' },
  { id: 'full', label: '詳細' },
  { id: 'json', label: 'JSON' },
];

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
  const [tab, setTab] = useState<Tab>('simple');
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
  }, [open, entry, translationLanguage]);

  const loadJson = () => {
    const { draft: loaded, error: failure } = jsonToDraft(json.raw, {
      original: json.original,
      source: json.source,
    });
    if (failure) return setError(failure);
    setError(null);
    if (loaded) {
      setDraft(loaded);
      setTab('full');
    }
  };

  const save = async () => {
    const invalid = draftError(draft);
    if (invalid) return setError(invalid);

    setSaving(true);
    setError(null);
    try {
      const id = entry
        ? (await repository.update(entry.id, draft), entry.id)
        : await repository.create(draft);
      await refresh();
      onSaved?.(id);
      onClose();
    } catch (cause) {
      console.error(cause);
      setError('保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={entry ? '単語を編集' : '単語を追加'}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          {error && <p className="flex-1 text-xs text-danger">{error}</p>}
          {tab === 'json' && !entry && (
            <button
              type="button"
              onClick={loadJson}
              disabled={!json.raw.trim()}
              className="min-h-10 rounded-pill bg-bg-alt px-5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              読み込む
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-10 rounded-pill bg-bg-alt px-5 text-sm font-semibold text-ink"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="min-h-10 rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      }
    >
      {!entry && (
        <div className="mb-5 flex gap-1 rounded-pill bg-bg-alt p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                // `error` carries both a JSON parse failure and a save failure.
                // Left alone, a malformed paste kept complaining from the footer
                // of the 詳細 tab, next to a 保存する it had nothing to do with.
                setError(null);
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
          <Field label="見出し語" hint="必須">
            <Text value={draft.headword} onChange={(v) => setDraft({ ...draft, headword: v })} />
          </Field>
          <Field label="読み方" hint="かな">
            <Text value={draft.reading} onChange={(v) => setDraft({ ...draft, reading: v })} />
          </Field>
          <Field label="意味・説明" hint="必須">
            <Area
              value={draft.definition}
              onChange={(v) => setDraft({ ...draft, definition: v })}
              rows={4}
            />
          </Field>
          <Field label="補足" hint="任意">
            <Area
              value={draft.definitionSub}
              onChange={(v) => setDraft({ ...draft, definitionSub: v })}
              rows={3}
            />
          </Field>
          <Field label="タグ" hint="スペース・カンマ区切り">
            <Text
              value={draft.tags.join(' ')}
              onChange={(v) => setDraft({ ...draft, tags: parseTags(v) })}
              placeholder="仕事 N2文法"
            />
          </Field>
          <p className="text-xs text-muted">
            残りの項目は「詳細」タブ、または保存後の編集から入力できます。
          </p>
        </div>
      )}

      {tab === 'full' && <EntryForm draft={draft} onChange={setDraft} />}

      {tab === 'json' && !entry && <JsonImport value={json} onChange={setJson} />}
    </Modal>
  );
}
