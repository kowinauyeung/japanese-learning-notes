import { useEffect, useMemo, useState } from 'react';
import { Distribution } from '@/components/dashboard/Distribution';
import { EntryRow } from '@/components/dashboard/EntryRow';
import { Heatmap } from '@/components/dashboard/Heatmap';
import { RecentPractice } from '@/components/dashboard/RecentPractice';
import { StatTiles } from '@/components/dashboard/StatTiles';
import { TodayWord, pickWordOfDay } from '@/components/dashboard/TodayWord';
import type { PracticeMode, PracticeSession } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { dateKey } from '@/lib/dates';
import { useEntries } from '@/lib/entries';
import { latestByMode, RECENT_WINDOW } from '@/lib/history';
import { useProgress } from '@/lib/progress';
import { summarise } from '@/lib/stats';

export function Component() {
  const { locale, t } = useI18n();
  const entryLabel = useEntryLabel();
  const { entries, loading, error } = useEntries();
  const errorMessage = useLoadErrorMessage(error);
  const { repository } = useProgress();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  /**
   * The newest session of each mode, or nulls while it is being read.
   *
   * Read here rather than held by `ProgressProvider`: sessions are an unbounded
   * collection and this is the only screen outside 履歴 that wants any of them,
   * so loading them on sign-in would be a read nobody asked for. A failure is
   * deliberately silent — the panel falls back to its empty state, and a
   * dashboard that refuses to render because one panel could not load would be
   * a worse answer than a panel that says 「まだ実施していません」.
   */
  const [latest, setLatest] = useState<Record<PracticeMode, PracticeSession | null>>(() =>
    latestByMode([]),
  );

  useEffect(() => {
    let cancelled = false;
    repository
      .listSessions({ limit: RECENT_WINDOW, cursor: null })
      .then((page) => {
        if (!cancelled) setLatest(latestByMode(page.items));
      })
      .catch((cause: unknown) => {
        console.error(cause);
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const stats = useMemo(() => summarise(entries, new Date()), [entries]);

  const recent = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.learnedOn.localeCompare(a.learnedOn));
    return selectedDay ? sorted.filter((e) => e.learnedOn === selectedDay) : sorted.slice(0, 8);
  }, [entries, selectedDay]);

  const wordOfDay = useMemo(() => pickWordOfDay(entries, dateKey(new Date())), [entries]);

  if (loading) return <p className="py-16 text-center text-sm text-muted">{t('common.loading')}</p>;
  if (errorMessage) return <p className="py-16 text-center text-sm text-danger">{errorMessage}</p>;

  return (
    <div className="space-y-4">
      {/* Hero row. Without a word of the day the notebook is empty, so the
          counts drop to a single full-width column rather than leaving a gap. */}
      <div className={`grid min-w-0 gap-4 ${wordOfDay ? 'sm:grid-cols-2' : ''}`}>
        {wordOfDay && <TodayWord entry={wordOfDay} />}
        <StatTiles week={stats.inWeek} month={stats.inMonth} year={stats.inYear} />
      </div>

      <RecentPractice latest={latest} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Distribution
          title={t('dashboard.jlpt', { count: entries.length })}
          rows={stats.jlptRows}
        />
        <Distribution
          title={t('dashboard.partOfSpeech')}
          rows={stats.posRows.map((row) => ({ ...row, label: entryLabel(row.label) }))}
        />
      </div>

      <Heatmap countsByDay={stats.countsByDay} selected={selectedDay} onSelect={setSelectedDay} />

      <section className="rounded-card bg-card p-5 shadow-panel">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted">
            {selectedDay
              ? t('dashboard.wordsOnDate', {
                  date: new Date(`${selectedDay}T00:00:00`).toLocaleDateString(locale, {
                    month: 'short',
                    day: 'numeric',
                  }),
                })
              : t('dashboard.recentWords')}
          </h2>
          {selectedDay && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs text-accent"
            >
              {t('dashboard.resetDate')}
            </button>
          )}
        </div>
        <div className="mt-2">
          {recent.length ? (
            recent.map((entry) => <EntryRow key={entry.id} entry={entry} />)
          ) : (
            <p className="px-3 py-4 text-sm text-muted">{t('dashboard.noWordsOnDate')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
