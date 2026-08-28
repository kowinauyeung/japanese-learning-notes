import { useEffect, useMemo, useState } from 'react';
import { Distribution } from '@/components/dashboard/Distribution';
import { EntryRow } from '@/components/dashboard/EntryRow';
import { Heatmap } from '@/components/dashboard/Heatmap';
import { RecentPractice } from '@/components/dashboard/RecentPractice';
import { StatTiles } from '@/components/dashboard/StatTiles';
import { TodayWord, pickWordOfDay } from '@/components/dashboard/TodayWord';
import type { Entry } from '@/domain/entry';
import type { EntryRepository } from '@/domain/ports';
import type { PracticeMode, PracticeSession } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { dateKey, startOfISOWeek, startOfMonth, startOfYear } from '@/lib/dates';
import { useEntries } from '@/lib/entries';
import { latestByMode, RECENT_WINDOW } from '@/lib/history';
import { captureLoadFailure } from '@/lib/loadError';
import type { LoadFailure } from '@/lib/loadError';
import { useProgress } from '@/lib/progress';
import { summarise, summaryFromDashboardStats } from '@/lib/stats';
import type { Summary } from '@/lib/stats';

const ENTRY_PAGE_SIZE = 200;
const RECENT_WORDS = 8;
const SELECTED_DAY_PAGE_SIZE = 50;
const AUTO_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function Component() {
  const { locale, t } = useI18n();
  const entryLabel = useEntryLabel();
  const { repository: entriesRepository } = useEntries();
  const [dashboard, setDashboard] = useState<{
    stats: Summary;
    recent: Entry[];
    wordOfDay: Entry | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);
  const errorMessage = useLoadErrorMessage(error);
  const { repository: progressRepository } = useProgress();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<{
    day: string;
    entries: Entry[];
  } | null>(null);

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
    progressRepository
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
  }, [progressRepository]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      try {
        const [storedStats, inWeek, inMonth, inYear, recent, wordOfDay] = await Promise.all([
          entriesRepository.dashboardStats(),
          entriesRepository.countLearnedSince(dateKey(startOfISOWeek(now))),
          entriesRepository.countLearnedSince(dateKey(startOfMonth(now))),
          entriesRepository.countLearnedSince(dateKey(startOfYear(now))),
          entriesRepository.recentLearned(RECENT_WORDS),
          entriesRepository.wordOfDay(wordOfDaySeed(dateKey(now))),
        ]);

        if (cancelled) return;
        if (storedStats) {
          setDashboard({
            stats: summaryFromDashboardStats(storedStats, { inWeek, inMonth, inYear }),
            recent,
            wordOfDay,
          });
          setError(null);
          return;
        }

        const all = await drainEntries(entriesRepository);
        if (cancelled) return;
        const stats = summarise(all, now);
        const fallbackRecent = [...all]
          .sort((a, b) => b.learnedOn.localeCompare(a.learnedOn))
          .slice(0, RECENT_WORDS);
        setDashboard({
          stats,
          recent: fallbackRecent,
          wordOfDay: pickWordOfDay(all, dateKey(now)),
        });
        setError(null);
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setError(captureLoadFailure(cause, 'load.entries'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [entriesRepository]);

  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    const load = async () => {
      try {
        const entries = await drainLearnedOn(entriesRepository, selectedDay);
        if (!cancelled) setSelectedEntries({ day: selectedDay, entries });
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setError(captureLoadFailure(cause, 'load.entries'));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [entriesRepository, selectedDay]);

  const stats = dashboard?.stats;
  const recent = useMemo(
    () =>
      selectedDay
        ? selectedEntries?.day === selectedDay
          ? selectedEntries.entries
          : []
        : (dashboard?.recent ?? []),
    [dashboard?.recent, selectedDay, selectedEntries],
  );
  const wordOfDay = dashboard?.wordOfDay ?? null;

  if (loading) return <p className="py-16 text-center text-sm text-muted">{t('common.loading')}</p>;
  if (errorMessage) return <p className="py-16 text-center text-sm text-danger">{errorMessage}</p>;
  if (!stats) return <p className="py-16 text-center text-sm text-muted">{t('common.loading')}</p>;

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
          title={t('dashboard.jlpt', {
            count: stats.jlptRows.reduce((sum, row) => sum + row.count, 0),
          })}
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

async function drainEntries(repository: EntryRepository): Promise<Entry[]> {
  const all: Entry[] = [];
  let cursor: string | null = null;
  do {
    const page = await repository.list({ limit: ENTRY_PAGE_SIZE, cursor });
    all.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

async function drainLearnedOn(repository: EntryRepository, day: string): Promise<Entry[]> {
  const all: Entry[] = [];
  let cursor: string | null = null;
  do {
    const page = await repository.listLearnedOn(day, {
      limit: SELECTED_DAY_PAGE_SIZE,
      cursor,
    });
    all.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

function wordOfDaySeed(todayKey: string) {
  let hash = 0;
  for (const char of todayKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  let state = hash || 1;
  let seed = '';
  for (let i = 0; i < 20; i += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    seed += AUTO_ID_ALPHABET[state % AUTO_ID_ALPHABET.length];
  }
  return seed;
}
