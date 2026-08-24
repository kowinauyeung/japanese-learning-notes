import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EntryBody } from '@/components/detail/EntryBody';
import { EntryHeadline } from '@/components/detail/EntryHeadline';
import { EntryFormModal } from '@/components/entry-form/EntryFormModal';
import { Modal } from '@/components/Modal';
import { SpeakButton, SpeechStatusNote } from '@/components/SpeakButton';
import { useI18n } from '@/i18n/context';
import { useEntries } from '@/lib/entries';
import { spokenForm, useJapaneseSpeech } from '@/lib/speech';
import { useVocabDialog } from '@/lib/vocabDialog';

/**
 * A word, looked at without leaving the page that mentioned it.
 *
 * The whole note, not a summary of it: `EntryHeadline` and `EntryBody` are the
 * same two components the detail page renders, so a word opened from a list and
 * the same word opened by its address say the same things in the same order.
 * The only difference is `surface="panel"` — the dialog body is already
 * `bg-card`, so the sections are separated by a border instead of by a card.
 *
 * Editing is here and deleting is not, and the two are not the same call.
 * Both write through `EntriesProvider`, which every screen reads from, so a
 * saved edit reaches the page underneath on the next render rather than leaving
 * it stale. A delete would leave this dialog sitting over a word that no longer
 * exists, showing 「単語が見つかりません」 above the list it was deleted from;
 * that belongs on the detail page, which can navigate away afterwards.
 *
 * Read out of `EntriesProvider` rather than fetched, because every screen that
 * can open this already holds the whole notebook. A word that is not there is
 * one deleted in another tab, and the dialog says so rather than showing a
 * frame with nothing in it.
 */
export function VocabDialog() {
  const { t } = useI18n();
  const { openId, close } = useVocabDialog();
  const { entries } = useEntries();
  // Above the early return, because hooks are: this component is mounted for
  // the whole session and renders nothing until a word is asked for.
  const { status: speechStatus, speak } = useJapaneseSpeech();
  /**
   * Which word the edit form is open for, rather than whether it is open.
   *
   * A boolean survives the dialog being closed with the form up, and the next
   * word opened from any list would then arrive already in a form nobody asked
   * to fill in. Comparing against `openId` makes a stale value inert without an
   * effect having to reset it.
   */
  const [editingId, setEditingId] = useState<string | null>(null);

  if (openId === null) return null;
  const entry = entries.find((item) => item.id === openId);

  if (!entry) {
    return (
      <Modal open title={t('vocabDialog.title')} onClose={close}>
        <p className="py-6 text-center text-sm text-muted">{t('vocabDialog.notFound')}</p>
      </Modal>
    );
  }

  /**
   * The form replaces the preview rather than opening on top of it.
   *
   * Two `Modal`s open at once are two focus traps and two Escape listeners
   * competing over the same keystroke, and the second one also re-runs the
   * `inert` bookkeeping the first is relying on. Swapping keeps one dialog on
   * screen at a time; closing the form returns to the preview, which by then is
   * reading the entry the save refreshed.
   */
  if (editingId === entry.id) {
    return <EntryFormModal open entry={entry} onClose={() => setEditingId(null)} />;
  }

  return (
    <Modal
      open
      title={t('vocabDialog.title')}
      onClose={close}
      footer={
        <Link
          to={`/vocabulary/${entry.id}`}
          /**
           * `replace`, because the address bar already reads this URL — the
           * dialog pushed it by hand when it opened. Pushing it a second time
           * leaves a duplicate entry the reader cannot see, so returning to the
           * page the dialog was opened over takes two presses of Back, the
           * first of which appears to do nothing.
           */
          replace
          className="grid min-h-10 w-full place-items-center rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          {t('vocabDialog.viewDetails')}
        </Link>
      }
    >
      <div className="min-w-0 space-y-4">
        <EntryHeadline
          entry={entry}
          compact
          actions={
            <>
              <SpeakButton status={speechStatus} onSpeak={() => speak(spokenForm(entry))} />
              <button
                type="button"
                onClick={() => setEditingId(entry.id)}
                className="min-h-9 rounded-pill bg-bg-alt px-4 text-xs font-semibold text-ink"
              >
                {t('common.edit')}
              </button>
            </>
          }
        />
        <SpeechStatusNote status={speechStatus} />

        <EntryBody entry={entry} surface="panel" />
      </div>
    </Modal>
  );
}
