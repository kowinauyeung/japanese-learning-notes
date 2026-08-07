import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, dateKey, fullDate } from '@/lib/dates';

const MONTHS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

/**
 * Row labels, Sunday-first to match the grid. Every other day is left blank:
 * a row is 11px tall, so seven stacked labels would run into each other.
 */
const WEEKDAYS = ['', '月', '', '水', '', '金', ''];

/** Gap between a cell and its tooltip, and the tooltip's minimum inset from the viewport edge. */
const TIP_MARGIN = 8;

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
  /**
   * The tooltip is `fixed` rather than absolute inside the grid: the grid
   * scrolls horizontally, and a container with `overflow-x: auto` clips on the
   * vertical axis too, which would cut the tooltip off above the top row.
   *
   * Holding the anchor element rather than a captured rect is what lets the
   * position be recalculated later — the rect goes stale as soon as anything
   * scrolls.
   */
  const [tip, setTip] = useState<{ label: string; anchor: HTMLElement } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  /** Centre on the cell, clamp to the viewport, and flip below when the space above is short. */
  const place = useCallback(() => {
    const node = tipRef.current;
    if (!tip || !node) return;
    const anchor = tip.anchor.getBoundingClientRect();
    const { width, height } = node.getBoundingClientRect();

    const centred = anchor.left + anchor.width / 2 - width / 2;
    // The upper bound wins when the tooltip is wider than the viewport, which
    // would otherwise push it off the left edge instead of the right.
    const left = Math.min(
      Math.max(centred, TIP_MARGIN),
      Math.max(TIP_MARGIN, window.innerWidth - width - TIP_MARGIN),
    );
    const above = anchor.top - height - TIP_MARGIN;

    setPos({ left, top: above >= TIP_MARGIN ? above : anchor.bottom + TIP_MARGIN });
  }, [tip]);

  // Measured before paint, so the frame where `pos` is still null is never shown.
  useLayoutEffect(() => {
    if (!tip) {
      setPos(null);
      return;
    }
    place();
  }, [tip, place]);

  /**
   * Reposition rather than dismiss: tabbing to a cell scrolls it into view, and
   * dismissing on scroll would close the tooltip that focus had just opened.
   * Capture phase so the heatmap's own horizontal scroller counts too — scroll
   * events from an element do not bubble to window.
   */
  useEffect(() => {
    if (!tip) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [tip, place]);

  const showTip = (cell: HTMLElement, day: { key: string; count: number }) => {
    setTip({ label: `${fullDate(day.key)} ・ ${day.count}語`, anchor: cell });
  };

  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Back up to the Sunday on or before "a year ago" so every column is a
    // complete Sun–Sat week and the rows line up.
    const from = addDays(today, -364);
    const start = addDays(from, -from.getDay());

    const result: { key: string; date: Date; count: number; future: boolean }[][] = [];
    for (
      let cursor = start;
      cursor <= today || cursor.getDay() !== 0;
      cursor = addDays(cursor, 1)
    ) {
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
    <section className="rounded-card bg-card p-5 shadow-panel">
      <h2 className="text-xs font-semibold tracking-wide text-muted">直近1年間の追加状況</h2>

      <div className="mt-4 flex gap-1">
        {/* Outside the scroller, so the labels stay put while the year scrolls
            past. The empty box matches the month row's height to keep the two
            columns aligned. Decorative — each cell already names its own date. */}
        <div className="shrink-0 text-[10px] text-muted" aria-hidden="true">
          <div className="mb-1 h-3" />
          <div className="grid grid-rows-7 gap-[2px]">
            {WEEKDAYS.map((label, index) => (
              <span key={index} className="h-[11px] leading-[11px]">
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* grow so the grid keeps filling the card — a flex item is content-width
            by default, which would pack the year against the left edge on a wide
            viewport. min-w-0 lets it shrink below content width and scroll on a
            narrow one, which min-width:auto would otherwise prevent. */}
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="min-w-max">
            {/* Month label sits above the week that contains the 1st. */}
            <div className="mb-1 grid grid-flow-col gap-[2px]">
              {weeks.map((week) => {
                const first = week.find((day) => day.date.getDate() <= 7);
                const isMonthStart = week.some((day) => day.date.getDate() === 1);
                return (
                  <span
                    key={week[0].key}
                    className="h-3 w-[11px] text-[10px] leading-3 whitespace-nowrap text-muted"
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
                          ? 'ring-2 ring-ink'
                          : 'hover:ring-1 hover:ring-ink/40 focus-visible:ring-1 focus-visible:ring-ink/40'
                      }`}
                    />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted">
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
          ref={tipRef}
          role="tooltip"
          style={{
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
          className="pointer-events-none fixed z-50 rounded-pill bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-bg shadow-panel"
        >
          {tip.label}
        </div>
      )}
    </section>
  );
}
