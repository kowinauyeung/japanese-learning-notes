import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EntryBody } from '@/components/detail/EntryBody';
import { EntryHeadline } from '@/components/detail/EntryHeadline';
import { EntryFormModal } from '@/components/entry-form/EntryFormModal';
import { SpeakButton, SpeechStatusNote } from '@/components/SpeakButton';
import { useI18n } from '@/i18n/context';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { useEntries } from '@/lib/entries';
import { spokenForm, useJapaneseSpeech } from '@/lib/speech';

export function Component() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { entries, loading, error, refresh, repository } = useEntries();
  const errorMessage = useLoadErrorMessage(error);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { status: speechStatus, speak } = useJapaneseSpeech();

  /**
   * Navigate only once both the delete and the refresh have succeeded. If the
   * refresh fails the entry is gone from Firestore but still in the cached
   * list, so leaving the user on a stale detail page with an error beats
   * sending them to a Browse list that still shows the deleted word.
   */
  const confirmDelete = async (entryId: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await repository.remove(entryId);
      await refresh();
      void navigate('/vocabulary', { replace: true });
    } catch (cause) {
      console.error(cause);
      setDeleteError(t('vocabulary.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading)
    return <p className="py-16 text-center text-sm text-muted">{t('vocabulary.loading')}</p>;
  if (errorMessage) return <p className="py-16 text-center text-sm text-danger">{errorMessage}</p>;

  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">{t('vocabulary.notFound')}</p>
        <Link to="/vocabulary" className="mt-2 inline-block text-sm text-accent underline">
          {t('vocabulary.backToList')}
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-4">
      {/* Header */}
      <header className="rounded-card bg-card p-5 shadow-panel sm:p-6">
        <EntryHeadline
          entry={entry}
          actions={
            <>
              <SpeakButton status={speechStatus} onSpeak={() => speak(spokenForm(entry))} />
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-9 rounded-pill bg-bg-alt px-4 text-xs font-semibold text-ink"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-9 rounded-pill bg-danger-soft px-4 text-xs font-semibold text-danger"
              >
                {t('common.delete')}
              </button>
            </>
          }
        />

        {/* Under the whole row rather than under the button: it is a sentence,
            and the button sits in a column sized for pills. */}
        <SpeechStatusNote status={speechStatus} className="mt-3" />
      </header>

      <EntryBody entry={entry} />

      <EntryFormModal open={editing} entry={entry} onClose={() => setEditing(false)} />

      <ConfirmDialog
        open={confirmingDelete}
        title={t('vocabulary.deleteTitle')}
        message={t('vocabulary.deleteMessage', { headword: entry.headword })}
        confirmLabel={t('vocabulary.deleteConfirm')}
        busy={deleting}
        error={deleteError}
        onClose={() => {
          setConfirmingDelete(false);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete(entry.id)}
      />
    </article>
  );
}
