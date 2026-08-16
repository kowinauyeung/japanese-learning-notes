import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DictationSession } from '@/components/practice/DictationSession';
import { FlashcardSession } from '@/components/practice/FlashcardSession';
import { PracticeSetup } from '@/components/practice/PracticeSetup';
import { SessionSummary } from '@/components/practice/SessionSummary';
import type { Entry } from '@/domain/entry';
import type { PracticeMode } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { useEntries } from '@/lib/entries';
import {
  describeFilters,
  practiceFiltersFromParams,
  matchesPractice,
  mergeProgress,
  scopeFor,
  shuffle,
  summariseSession,
} from '@/lib/practice';
import type { Answer, PracticeFilters } from '@/lib/practice';
import { useProgress } from '@/lib/progress';
import { recentTags } from '@/lib/tags';
import { membersOf } from '@/lib/wordSetMembers';
import { useWordSets } from '@/lib/wordSets';

/**
 * URL segment to mode, and the two are deliberately not the same word.
 *
 * The nav and the design both say `/practice/flashcards`; the domain value is
 * singular, because it labels one session in `PracticeSession.mode`. Reusing
 * the mode as the path silently renamed the route, and reusing the path as the
 * mode would put a plural in every stored record. An explicit table is the only
 * version of this that cannot drift unnoticed.
 */
const MODE_BY_SEGMENT: Record<string, PracticeMode> = {
  flashcards: 'flashcard',
  dictation: 'dictation',
};

/**
 * Both practice modes, behind `/practice/:mode`.
 *
 * One route rather than two because everything except the card itself — the
 * setup screen, the queue, the answer log, the summary and the write — is
 * identical, and the difference between them is which component renders an
 * entry. `mode` as a key resets that state when the learner switches from the
 * nav mid-session, which changing a route param otherwise would not do.
 */
export function Component() {
  const { mode: segment } = useParams();
  const mode = segment === undefined ? undefined : MODE_BY_SEGMENT[segment];
  if (!mode) return <Navigate to="/" replace />;
  return <Practice key={mode} mode={mode} />;
}

interface Session {
  queue: Entry[];
  index: number;
  answers: Answer[];
  startedAt: string;
  filterLabel: string;
}

function Practice({ mode }: { mode: PracticeMode }) {
  const { entries, loading, error } = useEntries();
  const errorMessage = useLoadErrorMessage(error);
  const {
    weakIds,
    loading: progressLoading,
    error: progressError,
    progress,
    record,
  } = useProgress();
  const { sets, loading: setsLoading } = useWordSets();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const filterLabels = useMemo(
    () => ({
      set: (name: string) => t('practice.filterSet', { name }),
      unknown: t('practice.filterUnknown'),
      weakOnly: t('practice.weakOnly'),
      all: t('practice.filterAll'),
    }),
    [t],
  );

  /**
   * Seeded from the query string, then owned by this screen.
   *
   * Read once rather than kept in sync, which is the opposite of what Browse
   * does — and deliberately. A Browse URL *is* the view, and stepping back
   * through refinements is the point. A practice URL is a way in: 履歴's 復習
   * button hands over a scope, and from that moment the setup screen is being
   * edited towards a session, not towards a link worth keeping.
   */
  const [filters, setFilters] = useState<PracticeFilters>(() =>
    practiceFiltersFromParams(searchParams),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [quitting, setQuitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Frozen at mount: 「直近1ヶ月」 must not shift under the learner because a
  // re-render happened to cross midnight.
  const now = useMemo(() => new Date(), []);

  const visibleTags = useMemo(() => recentTags(entries), [entries]);

  /**
   * Counted over the entries in hand, not over progress rows. A word answered
   * wrong and then deleted keeps its row — nothing prunes the map — so
   * `weakIds.size` would advertise 「1 語」 for a word that cannot be drilled,
   * and ticking the toggle would produce 「0 件が対象」.
   */
  const weakCount = useMemo(
    () => entries.filter((entry) => weakIds.has(entry.id)).length,
    [entries, weakIds],
  );

  /** Counted the same way and for the same reason — see `membersOf`. */
  const setChips = useMemo(
    () =>
      sets.map((set) => ({
        id: set.id,
        name: set.name,
        count: membersOf(set, entries).length,
      })),
    [sets, entries],
  );

  const matches = useMemo(() => {
    const scope = scopeFor(filters, sets, weakIds);
    return entries.filter((entry) => matchesPractice(entry, filters, scope));
  }, [entries, filters, sets, weakIds]);

  const start = (queue: Entry[], filterLabel: string) => {
    setSaveError(null);
    setSession({ queue, index: 0, answers: [], startedAt: new Date().toISOString(), filterLabel });
  };

  /**
   * `?start=1` — deal the cards without stopping at the setup screen.
   *
   * Waits for both loads before deciding, because the scope it was handed may
   * be 苦手のみ, and that is answered by the progress map rather than by the
   * entry. Firing while the map is still arriving would see no weak words, take
   * the empty-scope branch below, and never start at all — the ref makes that
   * permanent for the visit.
   *
   * All three loads, because `matches` is computed through `scopeFor(filters,
   * sets, weakIds)`: a `?set=…&start=1` link whose sets have not arrived yet
   * resolves the id against an empty array, sees no matches, and latches this
   * permanently — the sets landing a moment later cannot un-latch it. Latent
   * rather than live, since nothing generates a `set=` link today, but
   * `practiceFiltersToParams` serialises `sets` deliberately.
   *
   * **None of the three waits is verified.** Against the in-memory adapter all
   * of them settle in the same tick, so removing any one fails nothing; against
   * Firestore they are independent round trips. Reasoned, not measured — do not
   * read the green suite as cover for them.
   *
   * A scope that matches nothing falls through to the setup screen instead,
   * where 「0 件が対象」 already says so and 開始する is already blocked. The ref
   * makes it a one-shot: the learner may then edit the filters, and re-firing
   * would take the screen away from them mid-edit.
   */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || searchParams.get('start') !== '1') return;
    if (loading || progressLoading || setsLoading) return;
    autoStarted.current = true;
    if (matches.length > 0)
      start(shuffle(matches, Math.random), describeFilters(filters, sets, filterLabels));
    // `start` and `filters` are read at the moment this fires and are not what
    // decides whether it should; listing them would re-run it on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, progressLoading, setsLoading, matches, searchParams]);

  const finish = (finished: Session, answers: Answer[]) => {
    const at = new Date().toISOString();
    setSaving(true);
    setSaveError(null);
    record(
      summariseSession({
        mode,
        filterLabel: finished.filterLabel,
        answers,
        startedAt: finished.startedAt,
      }),
      mergeProgress(progress, answers, mode, at),
    )
      .catch((cause: unknown) => {
        console.error(cause);
        // The score is already on screen and the answers are already in state,
        // so a failed write costs the record, not the session. Saying so beats
        // throwing the result away.
        setSaveError(t('practice.saveError'));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  /**
   * The write is fired here rather than from inside the state updater on
   * purpose: React calls an updater twice under StrictMode, and a session
   * recorded twice is two rows in 履歴 for one drill.
   */
  const answer = (correct: boolean) => {
    if (!session) return;
    const entry = session.queue[session.index];
    if (!entry) return;
    const answers = [...session.answers, { entryId: entry.id, correct }];
    setSession({ ...session, index: session.index + 1, answers });
    if (answers.length === session.queue.length) finish(session, answers);
  };

  if (loading)
    return <p className="py-16 text-center text-sm text-muted">{t('vocabulary.loading')}</p>;
  if (errorMessage) return <p className="py-16 text-center text-sm text-danger">{errorMessage}</p>;

  if (!session) {
    return (
      <PracticeSetup
        mode={mode}
        filters={filters}
        allTags={visibleTags}
        allSets={setChips}
        now={now}
        matchCount={matches.length}
        weakCount={weakCount}
        weakState={progressError ? 'error' : progressLoading ? 'loading' : 'ready'}
        onChange={setFilters}
        onStart={() =>
          start(shuffle(matches, Math.random), describeFilters(filters, sets, filterLabels))
        }
        onCancel={() => void navigate('/')}
      />
    );
  }

  const current = session.queue[session.index];
  if (current) {
    const props = {
      entry: current,
      index: session.index,
      total: session.queue.length,
      onAnswer: answer,
      onQuit: () => setQuitting(true),
    };
    return (
      <>
        {mode === 'flashcard' ? (
          <FlashcardSession {...props} keyboard={!quitting} />
        ) : (
          <DictationSession {...props} />
        )}
        {/* An abandoned session is not recorded, so leaving really does throw
            the answers away — worth one keystroke of friction, and worth more
            once Escape can trigger it by accident. */}
        <ConfirmDialog
          open={quitting}
          title={t('practice.quitTitle')}
          message={t('practice.quitMessage', { count: session.answers.length })}
          confirmLabel={t('practice.quit')}
          onConfirm={() => {
            setQuitting(false);
            setSession(null);
          }}
          onClose={() => setQuitting(false)}
        />
      </>
    );
  }

  const missedIds = new Set(
    session.answers.filter((item) => !item.correct).map((item) => item.entryId),
  );
  const missed = session.queue.filter((entry) => missedIds.has(entry.id));

  return (
    <SessionSummary
      total={session.answers.length}
      correct={session.answers.filter((item) => item.correct).length}
      missed={missed}
      saving={saving}
      saveError={saveError}
      /**
       * The same words again, reshuffled — not the filters re-applied. The
       * session that just finished has already been recorded, so a perfect
       * 苦手のみ run has cleared every word it drilled: re-filtering would
       * restart into an empty queue and a 0 / 0 summary, at the moment the
       * learner did best.
       */
      onRestart={() => start(shuffle(session.queue, Math.random), session.filterLabel)}
      onRetryMissed={() =>
        start(shuffle(missed, Math.random), `${session.filterLabel} / ${t('practice.review')}`)
      }
    />
  );
}
