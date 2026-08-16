import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyValueTable, Section } from '@/components/detail/Section';
import { EntryFormModal } from '@/components/entry-form/EntryFormModal';
import { PitchAccent } from '@/components/PitchAccent';
import { Ruby } from '@/components/Ruby';
import { SpeakButton, SpeechStatusNote } from '@/components/SpeakButton';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { useEntries } from '@/lib/entries';
import { accentKana } from '@/lib/mora';
import { spokenForm, useJapaneseSpeech } from '@/lib/speech';

/** ①②③… for sense and example numbering, matching the notes. */
function circled(index: number): string {
  return index < 20 ? String.fromCharCode(0x2460 + index) : `${index + 1}`;
}

function stars(freq: number): string {
  return '★'.repeat(freq) + '☆'.repeat(Math.max(0, 5 - freq));
}

export function Component() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const entryLabel = useEntryLabel();
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

  const manifest = [
    { label: t('vocabulary.partOfSpeech'), value: entry.pos.map(entryLabel).join('／') },
    { label: t('vocabulary.jlptLevel'), value: entryLabel(entry.jlpt) },
    { label: t('vocabulary.origin'), value: entryLabel(entry.origin) },
    { label: t('vocabulary.style'), value: entryLabel(entry.style) },
    { label: t('vocabulary.politeness'), value: entryLabel(entry.politeness) },
    { label: t('vocabulary.frequency'), value: stars(entry.freq) },
    { label: t('vocabulary.citationForm'), value: entry.citationForm },
  ].filter((row) => row.value);

  const usageRows = [
    { label: t('vocabulary.whenUsed'), value: entry.usage.when },
    { label: t('vocabulary.translationEquivalent'), value: entry.usage.translation },
    { label: t('vocabulary.caution'), value: entry.usage.caution },
  ].filter((row) => row.value);

  return (
    <article className="space-y-4">
      {/* Header */}
      <header className="rounded-card bg-card p-5 shadow-panel sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-full min-w-0">
            <Ruby
              headword={entry.headword}
              reading={entry.reading}
              className="has-ruby block font-display text-[34px] font-bold [overflow-wrap:anywhere] sm:text-[40px]"
            />
            {entry.pitchAccent !== null && (
              <PitchAccent
                kana={accentKana(entry.headword, entry.reading)}
                pitchAccent={entry.pitchAccent}
                className="mt-2 block font-display text-lg"
              />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-pill bg-accent-soft px-2.5 py-1 font-semibold text-accent">
                {entry.jlpt}
              </span>
              {entry.pos.map((part) => (
                <span key={part} className="rounded-pill bg-bg-alt px-2.5 py-1 text-muted">
                  {entryLabel(part)}
                </span>
              ))}
              <span className="text-accent" title={`${t('vocabulary.frequency')} ${entry.freq}/5`}>
                {stars(entry.freq)}
              </span>
              <span className="text-muted tabular-nums">{entry.learnedOn}</span>
            </div>
            {entry.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/vocabulary?tag=${encodeURIComponent(tag)}`}
                    className="text-xs text-accent"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Playing the word sits with edit and delete rather than beside the
              headword: the heading is a block that fills its column, and moving
              it into a row with a button next to it re-flows the box that
              `tests/e2e/visual.spec.ts` crops to prove furigana lands above the
              word it reads. */}
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>

        {/* Under the whole row rather than under the button: it is a sentence,
            and the button sits in a column sized for pills. */}
        <SpeechStatusNote status={speechStatus} className="mt-3" />
      </header>

      <Section emoji="📋" title={t('vocabulary.manifest')}>
        <KeyValueTable rows={manifest} />
      </Section>

      {entry.posInfo && (
        <Section emoji="🔧" title={entry.posInfo.title}>
          <KeyValueTable rows={entry.posInfo.rows} />
        </Section>
      )}

      {/* The sentence the word was met in comes before the dictionary meaning,
          matching the markdown notes: 23 of the 24 that record a context put it
          first. Reading the encounter before the definition is also the order
          the word was actually learned in. */}
      {entry.context.original && (
        <Section emoji="📌" title={t('vocabulary.context')}>
          <blockquote className="prose-cjk rounded-panel border-l-4 border-accent bg-bg-alt px-4 py-3 text-sm">
            {entry.context.original}
          </blockquote>
          {entry.context.ja && (
            <p className="prose-cjk mt-4 text-sm whitespace-pre-line">{entry.context.ja}</p>
          )}
          {entry.context.translation && (
            <p className="prose-cjk mt-3 text-sm whitespace-pre-line text-muted">
              {entry.context.translation}
            </p>
          )}
        </Section>
      )}

      {(entry.definition || entry.definitionSub) && (
        <Section emoji="📖" title={t('vocabulary.definition')}>
          {entry.definition && (
            <p className="prose-cjk text-sm whitespace-pre-line">{entry.definition}</p>
          )}
          {entry.definitionSub && (
            <p className="prose-cjk mt-4 border-t border-line pt-4 text-sm whitespace-pre-line">
              {entry.definitionSub}
            </p>
          )}
        </Section>
      )}

      {entry.senses.length > 0 && (
        <Section emoji="🌐" title={t('vocabulary.senses')}>
          <ol className="divide-y divide-line">
            {entry.senses.map((sense, index) => (
              <li key={index} className="py-4 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold">
                  <span className="mr-1.5 text-accent">{circled(index)}</span>
                  {sense.label}
                </h3>
                {sense.description && <p className="prose-cjk mt-2 text-sm">{sense.description}</p>}
                {sense.example && (
                  <blockquote className="prose-cjk mt-3 border-l-2 border-line pl-3 text-sm">
                    {sense.example}
                    {sense.exampleGloss && (
                      <span className="block text-xs text-muted">
                        {t('vocabulary.gloss', { value: sense.exampleGloss })}
                      </span>
                    )}
                  </blockquote>
                )}
                {sense.translation && <p className="prose-cjk mt-2 text-sm">{sense.translation}</p>}
                {sense.usage && (
                  <p className="prose-cjk mt-2 text-xs text-muted">
                    {t('vocabulary.usageSituation', { value: sense.usage })}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.examples.length > 0 && (
        <Section emoji="📝" title={t('vocabulary.examples')}>
          <ol className="divide-y divide-line">
            {entry.examples.map((example, index) => (
              <li key={index} className="py-3 first:pt-0 last:pb-0">
                <p className="prose-cjk text-sm">
                  <span className="mr-1.5 text-accent">{circled(index)}</span>
                  {example.ja}
                </p>
                {example.translation && (
                  <p className="prose-cjk mt-1 pl-6 text-sm text-muted">{example.translation}</p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {usageRows.length > 0 && (
        <Section emoji="🗣️" title={t('vocabulary.usage')}>
          <KeyValueTable rows={usageRows} />
        </Section>
      )}

      {entry.related.length > 0 && (
        <Section emoji="🔗" title={t('vocabulary.related')}>
          <ul className="divide-y divide-line text-sm">
            {entry.related.map((related, index) => (
              <li key={index} className="py-2.5 first:pt-0 last:pb-0">
                <span className="font-display font-bold">{related.headword}</span>
                <span className="prose-cjk text-muted"> — {related.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {entry.source && (
        <p className="px-1 text-xs text-muted">
          {t('vocabulary.sourceLine', { source: entry.source })}
        </p>
      )}

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
