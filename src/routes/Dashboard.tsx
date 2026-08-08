import { useMemo, useState } from 'react';
import { Distribution } from '@/components/dashboard/Distribution';
import { EntryRow } from '@/components/dashboard/EntryRow';
import { Heatmap } from '@/components/dashboard/Heatmap';
import { StatTiles } from '@/components/dashboard/StatTiles';
import { TodayWord, pickWordOfDay } from '@/components/dashboard/TodayWord';
import { dateKey, shortDate } from '@/lib/dates';
import { useEntries } from '@/lib/entries';
import { summarise } from '@/lib/stats';

export function Component() {
  const { entries, loading, error } = useEntries();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const stats = useMemo(() => summarise(entries, new Date()), [entries]);

  const recent = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.learnedOn.localeCompare(a.learnedOn));
    return selectedDay ? sorted.filter((e) => e.learnedOn === selectedDay) : sorted.slice(0, 8);
  }, [entries, selectedDay]);

  const wordOfDay = useMemo(() => pickWordOfDay(entries, dateKey(new Date())), [entries]);

  if (loading) return <p className="py-16 text-center text-sm text-muted">読み込み中…</p>;
  if (error) return <p className="py-16 text-center text-sm text-danger">{error}</p>;

  return (
    <div className="space-y-4">
      {/* Hero row. Without a word of the day the notebook is empty, so the
          counts drop to a single full-width column rather than leaving a gap. */}
      <div className={`grid gap-4 ${wordOfDay ? 'sm:grid-cols-2' : ''}`}>
        {wordOfDay && <TodayWord entry={wordOfDay} />}
        <StatTiles week={stats.inWeek} month={stats.inMonth} year={stats.inYear} />
      </div>

      <section className="rounded-card bg-card p-5 shadow-panel">
        <h2 className="text-xs font-semibold tracking-wide text-muted">最新の練習</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {['フラッシュカード', '書き取り練習'].map((mode) => (
            <div key={mode} className="rounded-panel bg-bg-alt p-4">
              <p className="text-sm font-medium">{mode}</p>
              <p className="mt-1 text-xs text-muted">まだ実施していません</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Distribution title={`JLPTレベル（全 ${entries.length} 語）`} rows={stats.jlptRows} />
        <Distribution title="品詞" rows={stats.posRows} />
      </div>

      <Heatmap countsByDay={stats.countsByDay} selected={selectedDay} onSelect={setSelectedDay} />

      <section className="rounded-card bg-card p-5 shadow-panel">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted">
            {selectedDay ? `${shortDate(selectedDay)} で追加した語` : '最近追加した語'}
          </h2>
          {selectedDay && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs text-accent"
            >
              元に戻る
            </button>
          )}
        </div>
        <div className="mt-2">
          {recent.length ? (
            recent.map((entry) => <EntryRow key={entry.id} entry={entry} />)
          ) : (
            <p className="px-3 py-4 text-sm text-muted">この日に追加した語はありません</p>
          )}
        </div>
      </section>
    </div>
  );
}
