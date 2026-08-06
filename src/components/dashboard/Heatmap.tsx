import { useMemo } from 'react';
import { addDays, dateKey, shortDate } from '../../lib/dates';

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 0 entries, then 1 / 2 / 3 / 4+ — four filled buckets as the handoff asks. */
function level(count: number) {
  if (count === 0) return 0;
  return Math.min(count, 4);
}

export function Heatmap({
  countsByDay,
  selected,
  onSelect,
}: {
  countsByDay: Map<string, number>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Back up to the Sunday on or before "a year ago" so every column is a
    // complete Sun–Sat week and the rows line up.
    const from = addDays(today, -364);
    const start = addDays(from, -from.getDay());

    const result: { key: string; date: Date; count: number; future: boolean }[][] = [];
    for (let cursor = start; cursor <= today || cursor.getDay() !== 0; cursor = addDays(cursor, 1)) {
      if (cursor.getDay() === 0) result.push([]);
      const key = dateKey(cursor);
      result[result.length - 1].push({
        key,
        date: new Date(cursor),
        count: countsByDay.get(key) ?? 0,
        future: cursor > today,
      });
    }
    return result;
  }, [countsByDay]);

  return (
    <section className="rounded-card bg-card shadow-panel p-5">
      <h2 className="text-muted text-xs font-semibold tracking-wide">直近1年間の追加状況</h2>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-max">
          {/* Month label sits above the week that contains the 1st. */}
          <div className="mb-1 grid grid-flow-col gap-[2px]">
            {weeks.map((week) => {
              const first = week.find((day) => day.date.getDate() <= 7);
              const isMonthStart = week.some((day) => day.date.getDate() === 1);
              return (
                <span
                  key={week[0].key}
                  className="text-muted h-3 w-[11px] text-[10px] leading-3 whitespace-nowrap"
                >
                  {isMonthStart && first ? MONTHS[first.date.getMonth()] : ''}
                </span>
              );
            })}
          </div>

          <div className="grid grid-flow-col grid-rows-7 gap-[2px]">
            {weeks.flatMap((week) =>
              week.map((day) =>
                day.future ? (
                  <span key={day.key} className="h-[11px] w-[11px]" />
                ) : (
                  <button
                    key={day.key}
                    type="button"
                    title={`${shortDate(day.key)} — ${day.count}語`}
                    aria-label={`${shortDate(day.key)} ${day.count}語`}
                    onClick={() => onSelect(selected === day.key ? null : day.key)}
                    style={{ background: `var(--heat-${level(day.count)})` }}
                    className={`h-[11px] w-[11px] rounded-[2px] transition ${
                      selected === day.key ? 'ring-ink ring-2' : ''
                    }`}
                  />
                ),
              ),
            )}
          </div>
        </div>
      </div>

      <div className="text-muted mt-3 flex items-center justify-end gap-1.5 text-[11px]">
        <span>少ない</span>
        {[0, 1, 2, 3, 4].map((step) => (
          <span
            key={step}
            style={{ background: `var(--heat-${step})` }}
            className="h-[11px] w-[11px] rounded-[2px]"
          />
        ))}
        <span>多い</span>
      </div>
    </section>
  );
}
