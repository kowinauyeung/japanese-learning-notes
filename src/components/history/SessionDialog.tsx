import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';
import type { PracticeSession } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import type { MessageKey } from '@/i18n/messages';
import { JAPANESE } from '@/lib/contentLang';
import { missedWords, practisedWords, sessionTime } from '@/lib/history';
import type { WordRow } from '@/lib/history';

/**
 * The word itself, however much of it is left.
 *
 * Split out because the dialog prints the same word twice — once in the run and
 * once in 間違えた語 — and the two lists must not drift apart in how they draw
 * a word that has since been deleted.
 */
function WordLabel({ row }: { row: WordRow }) {
  const headword = row.kind === 'entry' ? row.entry.headword : row.headword;
  const reading = row.kind === 'entry' ? row.entry.reading : row.reading;

  return (
    // `flex-1` rather than leaving the row to `justify-between`: the run has
    // three columns, so spacing them apart centres the word between the number
    // and the mark instead of starting every word at the same place.
    <span className="min-w-0 flex-1 truncate text-left">
      <span className="font-display font-bold" lang={JAPANESE}>
        {headword}
      </span>
      {reading && (
        <span className="cjk-face text-sm text-muted" lang={JAPANESE}>
          （{reading}）
        </span>
      )}
    </span>
  );
}

/**
 * Said rather than left blank, wherever a deleted word appears.
 *
 * The row is already not clickable, so nothing here reads as a rendering fault
 * rather than as a word the learner deleted themselves. Muted and not
 * `text-danger` — deleting it was their own decision, not an error.
 */
function DeletedBadge() {
  const { t } = useI18n();

  return (
    <span className="shrink-0 rounded-pill bg-bg-alt px-2 py-0.5 text-[11px] font-semibold text-muted">
      {t('history.deletedWord')}
    </span>
  );
}

/**
 * One word, as a link to its note when there still is one.
 *
 * Not a `VocabLink` for a deleted word: the note is gone, so the address behind
 * it would 404 and the dialog it opens would be empty. A link here is an offer
 * the app cannot keep.
 *
 * The columns either side are the caller's, because the two lists do not carry
 * the same ones: 間違えた語 is a list of words and ends in the JLPT level, while
 * the run is a list of *answers* and ends in how each one went.
 */
function WordLine({
  row,
  lead,
  trail,
}: {
  row: WordRow;
  lead?: React.ReactNode;
  trail?: React.ReactNode;
}) {
  const body = (
    <>
      {lead}
      <WordLabel row={row} />
      {trail}
    </>
  );

  return row.kind === 'entry' ? (
    <li>
      <VocabLink entryId={row.entry.id} className="flex items-center gap-3 py-2">
        {body}
      </VocabLink>
    </li>
  ) : (
    <li className="flex items-center gap-3 py-2 text-muted">{body}</li>
  );
}

/**
 * How the run is narrowed. `all` first because it is the default: this section
 * is titled "every word in this session", and opening it already filtered would
 * hide part of what it claims to show.
 */
const ANSWER_FILTERS = ['all', 'correct', 'missed'] as const;
type AnswerFilter = (typeof ANSWER_FILTERS)[number];

/**
 * Two of these are the labels the ○ and ✕ already carry.
 *
 * Shared rather than duplicated because they name the same thing — a chip that
 * said 「正解」 while the mark beside it was labelled something else would be two
 * words for one idea in a list six rows long.
 */
const FILTER_LABEL = {
  all: 'history.filterAll',
  correct: 'history.answeredCorrect',
  missed: 'history.answeredWrong',
} as const satisfies Record<AnswerFilter, MessageKey>;

/**
 * The run, and the control that narrows it.
 *
 * **One list rather than two.** This was a full run and a separate list of the
 * wrong answers, and every missed word appeared in both — the same rows, drawn
 * twice, in a dialog on a phone. The questions they answered ("how did that
 * drill go", "what do I still not know") turn out to be the same list under two
 * filters, so they are one list and a filter.
 *
 * **Numbered before it is filtered.** The position is the drill's, not the
 * list's: narrowing to the wrong answers and reading 1, 2, 3 would say the
 * learner got the first three cards wrong. 2, 5, 9 says where they actually
 * came up.
 *
 * Buttons with `aria-pressed`, not a `tablist`. Tabs announce several panels
 * with one showing; this is one list that shrinks, and saying otherwise would
 * promise a structure that is not there.
 */
function RunList({ run }: { run: (WordRow & { correct: boolean })[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<AnswerFilter>('all');

  const numbered = run.map((row, index) => ({ ...row, position: index + 1 }));
  const counts = {
    all: numbered.length,
    correct: numbered.filter((row) => row.correct).length,
    missed: numbered.filter((row) => !row.correct).length,
  } satisfies Record<AnswerFilter, number>;
  const shown =
    filter === 'all' ? numbered : numbered.filter((row) => row.correct === (filter === 'correct'));

  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-muted">
        {t('history.practisedWords')}
      </h3>

      <div role="group" aria-label={t('history.answerFilter')} className="mt-2 flex gap-2">
        {ANSWER_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
            className={`min-h-9 rounded-pill px-3 text-xs font-medium transition ${
              filter === option ? 'bg-accent text-on-accent' : 'bg-bg-alt text-muted hover:text-ink'
            }`}
          >
            {t(FILTER_LABEL[option])}{' '}
            {/* The count is what the separate missed list used to say out loud.
                Losing it would make "how many did I get wrong" a thing you
                count by eye. */}
            <span className="tabular-nums">{counts[option]}</span>
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ol className="mt-2 divide-y divide-line">
          {shown.map((row) => (
            <WordLine
              key={`${row.kind === 'entry' ? row.entry.id : row.entryId}-${row.position}`}
              row={row}
              lead={
                <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                  {row.position}
                </span>
              }
              /* No JLPT level here. This list is read down the outcome column —
                 the eye follows one column of ○ and ✕ — and a second badge in
                 the way makes that a scan rather than a glance. */
              trail={
                <>
                  {row.kind === 'deleted' && <DeletedBadge />}
                  <span
                    role="img"
                    aria-label={t(
                      row.correct ? 'history.answeredCorrect' : 'history.answeredWrong',
                    )}
                    className={`w-4 shrink-0 text-center text-sm ${
                      row.correct ? 'text-sprout' : 'text-danger'
                    }`}
                  >
                    {row.correct ? '○' : '✕'}
                  </span>
                </>
              }
            />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('history.none')}</p>
      )}
    </div>
  );
}

/**
 * The wrong answers of a session recorded before the run was kept.
 *
 * **Transitional, and tracked for removal.** Those sessions never wrote down
 * what was answered correctly, so there is no run to filter and no way to
 * reconstruct one; without this they would open as a score with nothing under
 * it. It goes when the sessions that need it do.
 */
function LegacyMissedList({ missed }: { missed: WordRow[] }) {
  const { t } = useI18n();

  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-muted">{t('practice.missed')}</h3>
      {missed.length > 0 ? (
        <ul className="mt-2 divide-y divide-line">
          {missed.map((row) => (
            <WordLine
              key={row.kind === 'entry' ? row.entry.id : row.entryId}
              row={row}
              trail={
                row.kind === 'entry' ? (
                  <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                    {row.entry.jlpt}
                  </span>
                ) : (
                  <DeletedBadge />
                )
              }
            />
          ))}
        </ul>
      ) : (
        /* A perfect run, or one whose every missed word has since been deleted
           without a headword to fall back on. The score above tells them apart. */
        <p className="mt-2 text-sm text-muted">{t('history.none')}</p>
      )}
    </div>
  );
}

/**
 * One session, opened out.
 *
 * The row it comes from is a summary — mode, score, when — and this is where
 * the parts that do not fit go: the filter label in full rather than clipped,
 * and every card the session dealt, in the order it dealt them.
 *
 * A word whose note has since been deleted is printed from the copy the session
 * kept and marked as gone; see `MissedWord` for why the copy exists at all.
 *
 * **No duration.** `startedAt` is the learner's own clock and `finishedAt` is
 * the server's, deliberately — see `PracticeSessionDraft`. Subtracting one from
 * the other produces a number that is wrong by whatever the two disagree by,
 * and a drill that appears to have taken minus three minutes is worse than no
 * figure at all.
 */
function SessionBody({
  session,
  entries,
}: {
  session: PracticeSession;
  entries: readonly Entry[];
}) {
  const { locale, t } = useI18n();

  const run = practisedWords(session, entries);
  const percent = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;

  return (
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
          {/* The label stored on the day, not one rebuilt now: a 単語集 renamed
              since would otherwise rewrite what was drilled. */}
          <dd className="prose-cjk min-w-0">{session.filterLabel}</dd>
        </div>
      </dl>

      {/* Null is not an empty run — see `practisedWords`. */}
      {run !== null ? (
        <RunList run={run} />
      ) : (
        <LegacyMissedList missed={missedWords(session, entries)} />
      )}
    </div>
  );
}

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
  const { t } = useI18n();
  if (!session) return null;

  return (
    <Modal
      open
      title={t(session.mode === 'flashcard' ? 'practice.flashcard' : 'practice.dictation')}
      onClose={onClose}
    >
      {/* Keyed, so opening a different session remounts the body and the answer
          filter starts at "all" again. A `useEffect` resetting it would run a
          render late, showing the new session through the old session's filter
          for one frame. */}
      <SessionBody key={session.id} session={session} entries={entries} />
    </Modal>
  );
}
