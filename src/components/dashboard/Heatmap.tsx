import { useMemo, useState } from 'react';
import { addDays, dateKey, fullDate } from '../../lib/dates';

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
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);

  /**
   * Positioned `fixed` from the cell's viewport rect rather than absolutely
   * inside the grid: the grid scrolls horizontally, and a container with
   * `overflow-x: auto` clips on the vertical axis too, which would cut the
   * tooltip off above the top row.
   */
  const showTip = (cell: HTMLElement, day: { key: string; count: number }) => {
    const rect = cell.getBoundingClientRect();
    setTip({
      label: `${fullDate(day.key)} ・ ${day.count}語`,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

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
                    aria-label={`${fullDate(day.key)} ${day.count}語`}
                    onClick={() => onSelect(selected === day.key ? null : day.key)}
                    onMouseEnter={(event) => showTip(event.currentTarget, day)}
                    onFocus={(event) => showTip(event.currentTarget, day)}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                    style={{ background: `var(--heat-${level(day.count)})` }}
                    className={`h-[11px] w-[11px] rounded-[2px] transition ${
                      selected === day.key
                        ? 'ring-ink ring-2'
                        : 'hover:ring-ink/40 focus-visible:ring-ink/40 hover:ring-1 focus-visible:ring-1'
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

      {tip && (
        <div
          role="tooltip"
          style={{ left: tip.x, top: tip.y - 8 }}
          className="rounded-pill bg-ink text-bg shadow-panel pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
        >
          {tip.label}
        </div>
      )}
    </section>
  );
}
