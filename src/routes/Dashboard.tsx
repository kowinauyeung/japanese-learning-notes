import { useMemo, useState } from 'react';
import { useEntries } from '../lib/entries';
import { JLPT_LEVELS } from '../types/entry';
import {
  dateKey,
  parseLocalDate,
  shortDate,
  startOfISOWeek,
  startOfMonth,
  startOfYear,
} from '../lib/dates';
import { StatTiles } from '../components/dashboard/StatTiles';
import { Distribution } from '../components/dashboard/Distribution';
import { Heatmap } from '../components/dashboard/Heatmap';
import { TodayWord, pickWordOfDay } from '../components/dashboard/TodayWord';
import { EntryRow } from '../components/dashboard/EntryRow';

export function Component() {
  const { entries, loading, error } = useEntries();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const stats = useMemo(() => {
    const now = new Date();
    const week = startOfISOWeek(now);
    const month = startOfMonth(now);
    const year = startOfYear(now);

    const countsByDay = new Map<string, number>();
    let inWeek = 0;
    let inMonth = 0;
    let inYear = 0;
    const jlpt = new Map<string, number>();
    const pos = new Map<string, number>();

    for (const entry of entries) {
      const learned = parseLocalDate(entry.learnedOn);
      countsByDay.set(entry.learnedOn, (countsByDay.get(entry.learnedOn) ?? 0) + 1);
      if (learned >= week) inWeek += 1;
      if (learned >= month) inMonth += 1;
      if (learned >= year) inYear += 1;
      jlpt.set(entry.jlpt, (jlpt.get(entry.jlpt) ?? 0) + 1);
      for (const part of entry.pos) pos.set(part, (pos.get(part) ?? 0) + 1);
    }

    return {
      countsByDay,
      inWeek,
      inMonth,
      inYear,
      jlptRows: JLPT_LEVELS.filter((level) => jlpt.has(level)).map((level) => ({
        label: level,
        count: jlpt.get(level) ?? 0,
      })),
      posRows: [...pos.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [entries]);

  const recent = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.learnedOn.localeCompare(a.learnedOn));
    return selectedDay ? sorted.filter((e) => e.learnedOn === selectedDay) : sorted.slice(0, 8);
  }, [entries, selectedDay]);

  const wordOfDay = useMemo(() => pickWordOfDay(entries, dateKey(new Date())), [entries]);

  if (loading) return <p className="text-muted py-16 text-center text-sm">読み込み中…</p>;
  if (error) return <p className="text-danger py-16 text-center text-sm">{error}</p>;

  return (
    <div className="space-y-4">
      {/* Hero row. Without a word of the day the notebook is empty, so the
          counts drop to a single full-width column rather than leaving a gap. */}
      <div className={`grid gap-4 ${wordOfDay ? 'sm:grid-cols-2' : ''}`}>
        {wordOfDay && <TodayWord entry={wordOfDay} />}
        <StatTiles week={stats.inWeek} month={stats.inMonth} year={stats.inYear} />
      </div>

      <section className="rounded-card bg-card shadow-panel p-5">
        <h2 className="text-muted text-xs font-semibold tracking-wide">最新の練習</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {['フラッシュカード', '書き取り練習'].map((mode) => (
            <div key={mode} className="rounded-panel bg-bg-alt p-4">
              <p className="text-sm font-medium">{mode}</p>
              <p className="text-muted mt-1 text-xs">まだ実施していません</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Distribution title={`JLPTレベル（全 ${entries.length} 語）`} rows={stats.jlptRows} />
        <Distribution title="品詞" rows={stats.posRows} />
      </div>

      <Heatmap
        countsByDay={stats.countsByDay}
        selected={selectedDay}
        onSelect={setSelectedDay}
      />

      <section className="rounded-card bg-card shadow-panel p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-muted text-xs font-semibold tracking-wide">
            {selectedDay ? `${shortDate(selectedDay)} で追加した語` : '最近追加した語'}
          </h2>
          {selectedDay && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-accent text-xs"
            >
              元に戻る
            </button>
          )}
        </div>
        <div className="mt-2">
          {recent.length ? (
            recent.map((entry) => <EntryRow key={entry.id} entry={entry} />)
          ) : (
            <p className="text-muted px-3 py-4 text-sm">この日に追加した語はありません</p>
          )}
        </div>
      </section>
    </div>
  );
}
