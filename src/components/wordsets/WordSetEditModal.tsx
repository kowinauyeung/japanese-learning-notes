import { useEffect, useState } from 'react';
import { Area, Field, Text } from '@/components/entry-form/fields';
import { Modal } from '@/components/Modal';
import { WORD_SET_LIMITS } from '@/domain/limits';
import type { WordSet } from '@/domain/wordSet';
import { useI18n } from '@/i18n/context';
import { localizeFormError } from '@/i18n/localizeFormError';
import { wordSetError } from '@/lib/wordSetDraft';

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
  /**
   * The refusal message, or null. It was a boolean and could only ever say
   * "the name is empty", which is no longer the only way a set can be invalid.
   */
  const [invalid, setInvalid] = useState<string | null>(null);
  const { t } = useI18n();

  /**
   * Reopening after a cancel must show what is stored, not what was abandoned.
   *
   * Keyed on the id rather than the object: `refresh()` rebuilds every `WordSet`,
   * so any refresh landing while this is open would otherwise re-run the reset
   * and discard what has been typed. Unreachable today — this page is the only
   * writer and 保存する is `busy`-gated — and the key is what keeps it that way
   * without depending on that argument holding.
   */
  useEffect(() => {
    if (!open) return;
    setName(set.name);
    setDescription(set.description);
    setInvalid(null);
  }, [open, set.id, set.name, set.description]);

  const save = () => {
    const problem = wordSetError({ name, description });
    if (problem) return setInvalid(localizeFormError(problem, t));
    onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <Modal
      open={open}
      title={t('wordSets.editTitle')}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          {(invalid || error) && <p className="flex-1 text-xs text-danger">{invalid ?? error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-10 rounded-pill bg-bg-alt px-5 text-sm font-semibold text-ink"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="min-h-10 rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? t('wordSets.saving') : t('wordSets.save')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label={t('wordSets.name')} hint={t('wordSets.required')}>
          <Text
            value={name}
            maxLength={WORD_SET_LIMITS.name}
            onChange={(value) => {
              setName(value);
              setInvalid(null);
            }}
          />
        </Field>
        <Field label={t('wordSets.description')} hint={t('wordSets.optional')}>
          <Area
            value={description}
            onChange={(value) => {
              setDescription(value);
              setInvalid(null);
            }}
            maxLength={WORD_SET_LIMITS.description}
            rows={3}
          />
        </Field>
      </div>
    </Modal>
  );
}
