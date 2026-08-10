import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DictationSession } from '@/components/practice/DictationSession';
import { FlashcardSession } from '@/components/practice/FlashcardSession';
import { PracticeSetup } from '@/components/practice/PracticeSetup';
import { SessionSummary } from '@/components/practice/SessionSummary';
import type { Entry } from '@/domain/entry';
import type { PracticeMode } from '@/domain/practice';
import { useEntries } from '@/lib/entries';
import {
  describeFilters,
  EMPTY_PRACTICE_FILTERS,
  matchesPractice,
  mergeProgress,
  scopeFor,
  shuffle,
  summariseSession,
} from '@/lib/practice';
import type { Answer, PracticeFilters } from '@/lib/practice';
import { useProgress } from '@/lib/progress';
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
  const {
    weakIds,
    loading: progressLoading,
    error: progressError,
    progress,
    record,
  } = useProgress();
  const { sets } = useWordSets();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<PracticeFilters>(EMPTY_PRACTICE_FILTERS);
  const [session, setSession] = useState<Session | null>(null);
  const [quitting, setQuitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Frozen at mount: 「直近1ヶ月」 must not shift under the learner because a
  // re-render happened to cross midnight.
  const now = useMemo(() => new Date(), []);

  const allTags = useMemo(
    () =>
      [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b, 'ja')),
    [entries],
  );

  const matches = useMemo(() => {
    const scope = scopeFor(filters, sets, weakIds);
    return entries.filter((entry) => matchesPractice(entry, filters, scope));
  }, [entries, filters, sets, weakIds]);

  const start = (queue: Entry[], filterLabel: string) => {
    setSaveError(null);
    setSession({ queue, index: 0, answers: [], startedAt: new Date().toISOString(), filterLabel });
  };

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
        setSaveError('練習の記録を保存できませんでした。');
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

  if (loading) return <p className="py-16 text-center text-sm text-muted">読み込み中…</p>;
  if (error) return <p className="py-16 text-center text-sm text-danger">{error}</p>;

  if (!session) {
    return (
      <PracticeSetup
        mode={mode}
        filters={filters}
        allTags={allTags}
        allSets={sets}
        now={now}
        matchCount={matches.length}
        weakCount={weakIds.size}
        weakState={progressError ? 'error' : progressLoading ? 'loading' : 'ready'}
        onChange={setFilters}
        onStart={() => start(shuffle(matches, Math.random), describeFilters(filters, sets))}
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
          title="練習を中断しますか？"
          message={`ここまでの ${session.answers.length} 問は記録されません。`}
          confirmLabel="中断する"
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
      onRestart={() => start(shuffle(matches, Math.random), describeFilters(filters, sets))}
      onRetryMissed={() => start(shuffle(missed, Math.random), `${session.filterLabel} / 復習`)}
    />
  );
}
