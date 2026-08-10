import { useEffect, useState } from 'react';
import { Area, Field, Text } from '@/components/entry-form/fields';
import { Modal } from '@/components/Modal';
import type { WordSet } from '@/domain/wordSet';

/**
 * Renaming a 単語集 and giving it a description.
 *
 * `level` and `topics` are on `WordSet` and have no field here on purpose:
 * both exist to describe a set to somebody else once it is published, and
 * nothing publishes yet. A form that wrote them would be asking the user to
 * fill in metadata no screen in the app reads back.
 */
export function WordSetEditModal({
  open,
  set,
  busy,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  set: WordSet;
  busy: boolean;
  error: string | null;
  onSave: (fields: { name: string; description: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(set.name);
  const [description, setDescription] = useState(set.description);
  const [invalid, setInvalid] = useState(false);

  // Reopening after a cancel must show what is stored, not what was abandoned.
  useEffect(() => {
    if (!open) return;
    setName(set.name);
    setDescription(set.description);
    setInvalid(false);
  }, [open, set]);

  const save = () => {
    if (!name.trim()) return setInvalid(true);
    onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <Modal
      open={open}
      title="単語集を編集"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          {(invalid || error) && (
            <p className="flex-1 text-xs text-danger">{invalid ? '名前は必須です。' : error}</p>
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
            onClick={save}
            disabled={busy}
            className="min-h-10 rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="名前" hint="必須">
          <Text
            value={name}
            onChange={(value) => {
              setName(value);
              setInvalid(false);
            }}
          />
        </Field>
        <Field label="説明" hint="任意">
          <Area value={description} onChange={setDescription} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
