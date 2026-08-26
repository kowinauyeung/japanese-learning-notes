import { Modal } from '@/components/Modal';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';
import type { PracticeSession } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { JAPANESE } from '@/lib/contentLang';
import { missedWords, sessionTime } from '@/lib/history';

/**
 * One session, opened out.
 *
 * The row it comes from is a summary — mode, score, when — and this is where
 * the parts that do not fit go: the filter label in full rather than clipped,
 * and every word that was missed, each a link to the note.
 *
 * **No duration.** `startedAt` is the learner's own clock and `finishedAt` is
 * the server's, deliberately — see `PracticeSessionDraft`. Subtracting one from
 * the other produces a number that is wrong by whatever the two disagree by,
 * and a drill that appears to have taken minus three minutes is worse than no
 * figure at all.
 */
export function SessionDialog({
  session,
  entries,
  onClose,
}: {
  /** Null when nothing is open, so the caller can pass its state straight in. */
  session: PracticeSession | null;
  entries: readonly Entry[];
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  if (!session) return null;

  const missed = missedWords(session, entries);
  const percent = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;

  return (
    <Modal
      open
      title={t(session.mode === 'flashcard' ? 'practice.flashcard' : 'practice.dictation')}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <p className="font-display text-3xl font-bold tabular-nums">
            {session.correct} / {session.total}
          </p>
          <p className="text-sm text-muted tabular-nums">{percent}%</p>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">{t('history.finished')}</dt>
            <dd className="tabular-nums">{sessionTime(session.finishedAt, locale)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">{t('history.filters')}</dt>
            {/* The label stored on the day, not one rebuilt now: a 単語集
                renamed since would otherwise rewrite what was drilled. */}
            <dd className="prose-cjk min-w-0">{session.filterLabel}</dd>
          </div>
        </dl>

        <div>
          <h3 className="text-xs font-semibold tracking-wide text-muted">{t('practice.missed')}</h3>
          {missed.length > 0 ? (
            <ul className="mt-2 divide-y divide-line">
              {missed.map((entry) => (
                <li key={entry.id}>
                  <VocabLink
                    entryId={entry.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-display font-bold" lang={JAPANESE}>
                        {entry.headword}
                      </span>
                      {entry.reading && (
                        <span className="cjk-face text-sm text-muted" lang={JAPANESE}>
                          （{entry.reading}）
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {entry.jlpt}
                    </span>
                  </VocabLink>
                </li>
              ))}
            </ul>
          ) : (
            /* Either a perfect run or every missed word has since been deleted —
               the count above is what distinguishes them. */
            <p className="mt-2 text-sm text-muted">{t('history.none')}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
