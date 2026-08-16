import { Link } from 'react-router-dom';
import { PRACTICE_MODES } from '@/domain/practice';
import type { PracticeMode, PracticeSession } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { sessionTime } from '@/lib/history';

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
  const { locale, t } = useI18n();
  const modeLabel: Record<PracticeMode, string> = {
    flashcard: t('nav.flashcards'),
    dictation: t('nav.dictation'),
  };
  return (
    <section className="rounded-card bg-card p-5 shadow-panel">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted">
          {t('dashboard.latestPractice')}
        </h2>
        <Link to="/history" className="text-xs text-accent hover:underline">
          {t('dashboard.viewHistory')}
        </Link>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {PRACTICE_MODES.map((mode) => {
          const session = latest[mode];
          return (
            <Link
              key={mode}
              to={MODE_PATH[mode]}
              className="min-w-0 overflow-hidden rounded-panel bg-bg-alt p-4 transition hover:bg-accent-soft"
            >
              <p className="text-sm font-medium">{modeLabel[mode]}</p>
              {session ? (
                <>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">
                    {session.correct} / {session.total}
                  </p>
                  <p className="truncate text-xs text-muted" title={session.filterLabel}>
                    {sessionTime(session.finishedAt, locale)} · {session.filterLabel}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted">{t('dashboard.notPracticed')}</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
