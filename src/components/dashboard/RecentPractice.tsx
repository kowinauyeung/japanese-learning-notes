import { Link } from 'react-router-dom';
import { PRACTICE_MODES } from '@/domain/practice';
import type { PracticeMode, PracticeSession } from '@/domain/practice';
import { sessionTime } from '@/lib/history';

const MODE_LABEL: Record<PracticeMode, string> = {
  flashcard: 'フラッシュカード',
  dictation: '書き取り練習',
};

const MODE_PATH: Record<PracticeMode, string> = {
  flashcard: '/practice/flashcards',
  dictation: '/practice/dictation',
};

/**
 * 最新の練習 — the last run of each mode, or an invitation to start one.
 *
 * Each card is a link into its own mode: the empty state is the most likely
 * moment somebody wants to begin, and the filled one is where they look after
 * finishing. `null` here reads as "not yet" — see `latestByMode` for the
 * bounded case where that is not strictly true.
 */
export function RecentPractice({
  latest,
}: {
  latest: Record<PracticeMode, PracticeSession | null>;
}) {
  return (
    <section className="rounded-card bg-card p-5 shadow-panel">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted">最新の練習</h2>
        <Link to="/history" className="text-xs text-accent hover:underline">
          履歴を見る
        </Link>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {PRACTICE_MODES.map((mode) => {
          const session = latest[mode];
          return (
            <Link
              key={mode}
              to={MODE_PATH[mode]}
              className="rounded-panel bg-bg-alt p-4 transition hover:bg-accent-soft"
            >
              <p className="text-sm font-medium">{MODE_LABEL[mode]}</p>
              {session ? (
                <>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">
                    {session.correct} / {session.total}
                  </p>
                  <p className="text-xs text-muted">
                    {sessionTime(session.finishedAt)} · {session.filterLabel}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted">まだ実施していません</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
