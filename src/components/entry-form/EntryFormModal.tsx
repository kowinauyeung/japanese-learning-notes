import { useEffect, useState } from 'react';
import type { Entry, EntryDraft } from '@/types/entry';
import { createEntry, updateEntry } from '@/lib/entryWrite';
import { emptyDraft, invalidTags, parseTags, toDraft } from '@/lib/draft';
import { isValidIsoDate } from '@/lib/sanitize';
import { useEntries } from '@/lib/entries';
import { Modal } from '@/components/Modal';
import { EntryForm } from './EntryForm';
import { JsonImport } from './JsonImport';
import { Area, Field, Text } from './fields';

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
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Present when editing; absent when adding. */
  entry?: Entry;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { refresh } = useEntries();
  const [tab, setTab] = useState<Tab>('simple');
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(entry ? toDraft(entry) : emptyDraft());
    setTab(entry ? 'full' : 'simple');
    setError(null);
  }, [open, entry]);

  const save = async () => {
    if (!draft.headword.trim()) return setError('見出し語は必須です。');
    if (!draft.definition.trim()) return setError('意味・説明は必須です。');
    const bad = invalidTags(draft.tags);
    if (bad.length) return setError(`タグに使えない文字があります: ${bad.join(', ')}`);
    // A cleared or impossible date must not reach Firestore. Read-side coercion
    // would silently rewrite it to today, which is indistinguishable from having
    // learned the word today and quietly wrong in every dashboard statistic.
    if (!isValidIsoDate(draft.learnedOn)) return setError('学習日を正しく入力してください。');

    setSaving(true);
    setError(null);
    try {
      const id = entry ? (await updateEntry(entry.id, draft), entry.id) : await createEntry(draft);
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
              onClick={() => setTab(item.id)}
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

      {tab === 'json' && !entry && (
        <JsonImport
          onLoad={(loaded) => {
            setDraft(loaded);
            setTab('full');
          }}
        />
      )}
    </Modal>
  );
}
