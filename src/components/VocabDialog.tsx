import { Link } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { PitchAccent } from '@/components/PitchAccent';
import { Ruby } from '@/components/Ruby';
import { SpeakButton, SpeechStatusNote } from '@/components/SpeakButton';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { useEntries } from '@/lib/entries';
import { accentKana } from '@/lib/mora';
import { spokenForm, useJapaneseSpeech } from '@/lib/speech';
import { useVocabDialog } from '@/lib/vocabDialog';

/**
 * A word, looked at without leaving the page that mentioned it.
 *
 * A peek, not the detail page: meaning, the senses and one example, and a way
 * through to everything else. Editing and deleting are deliberately absent —
 * they change what other screens are showing, and the page underneath this one
 * has no idea it happened.
 *
 * Read out of `EntriesProvider` rather than fetched, because every screen that
 * can open this already holds the whole notebook. A word that is not there is
 * one deleted in another tab, and the dialog says so rather than showing a
 * frame with nothing in it.
 */
export function VocabDialog() {
  const { t } = useI18n();
  const entryLabel = useEntryLabel();
  const { openId, close } = useVocabDialog();
  const { entries } = useEntries();
  // Above the early return, because hooks are: this component is mounted for
  // the whole session and renders nothing until a word is asked for.
  const { status: speechStatus, speak } = useJapaneseSpeech();

  if (openId === null) return null;
  const entry = entries.find((item) => item.id === openId);

  if (!entry) {
    return (
      <Modal open title={t('vocabDialog.title')} onClose={close}>
        <p className="py-6 text-center text-sm text-muted">{t('vocabDialog.notFound')}</p>
      </Modal>
    );
  }

  const meanings = entry.senses.map((sense) => sense.description).filter(Boolean);
  const example = entry.senses.find((sense) => sense.example)?.example ?? entry.examples[0]?.ja;

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
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <Ruby
              headword={entry.headword}
              reading={entry.reading}
              className="has-ruby block min-w-0 font-display text-3xl font-bold [overflow-wrap:anywhere]"
            />
            <SpeakButton status={speechStatus} onSpeak={() => speak(spokenForm(entry))} />
          </div>
          <SpeechStatusNote status={speechStatus} className="mt-2" />
          {entry.pitchAccent !== null && (
            <PitchAccent
              kana={accentKana(entry.headword, entry.reading)}
              pitchAccent={entry.pitchAccent}
              className="mt-2 block font-display text-base"
            />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-pill bg-accent-soft px-2.5 py-1 font-semibold text-accent">
              {entry.jlpt}
            </span>
            {entry.pos.map((part) => (
              <span key={part} className="rounded-pill bg-bg-alt px-2.5 py-1 text-muted">
                {entryLabel(part)}
              </span>
            ))}
            <span className="text-muted tabular-nums">{entry.learnedOn}</span>
          </div>
        </div>

        {(meanings.length > 0 || entry.definition) && (
          <ul className="prose-cjk space-y-1 text-sm">
            {(meanings.length ? meanings : [entry.definition]).map((meaning, position) => (
              <li key={position} className="flex gap-2">
                <span className="text-muted">・</span>
                <span>{meaning}</span>
              </li>
            ))}
          </ul>
        )}

        {example && <p className="prose-cjk rounded-panel bg-bg-alt p-3 text-sm">{example}</p>}

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <span key={tag} className="text-xs text-accent">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
