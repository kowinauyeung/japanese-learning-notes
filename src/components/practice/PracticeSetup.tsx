import { JLPT_LEVELS, POS, WORD_ORIGINS } from '@/domain/entry';
import type { PracticeMode } from '@/domain/practice';
import { activeQuickRange, QUICK_RANGES, quickRangeStart } from '@/lib/practice';
import type { PracticeFilters } from '@/lib/practice';

/**
 * A 単語集 chip, already counted.
 *
 * `count` is the number of words the set still has in the notebook, not
 * `entryIds.length`: deleting a word does not visit the sets that named it, so
 * the stored array can outlive its members and the badge would promise cards
 * the queue cannot deal.
 */
export interface SetChip {
  id: string;
  name: string;
  count: number;
}

const MODE_TITLE: Record<PracticeMode, string> = {
  flashcard: 'フラッシュカード',
  dictation: '書き取り練習',
};

const MODE_NOTE: Record<PracticeMode, string> = {
  flashcard: '見出し語を見て意味を思い出す練習です。',
  dictation: '読み上げられた語を聞いて入力する練習です。',
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function chipClass(active: boolean) {
  return `rounded-pill px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-accent text-on-accent' : 'bg-bg-alt text-muted hover:text-ink'
  }`;
}

const selectClass = 'rounded-panel border-line bg-bg text-ink min-h-9 border px-2 text-xs w-full';

/**
 * The screen both practice modes open on.
 *
 * The 単語集 row hides itself when there are none, which is the design's rule
 * for a notebook that has not organised anything yet.
 *
 * `matchCount` is computed by the caller rather than here, because the same
 * filtered list is what 開始する turns into the queue — recomputing it in two
 * places is how a screen ends up promising a count it does not deliver.
 */
export function PracticeSetup({
  mode,
  filters,
  allTags,
  allSets,
  now,
  matchCount,
  weakCount,
  weakState,
  onChange,
  onStart,
  onCancel,
}: {
  mode: PracticeMode;
  filters: PracticeFilters;
  allTags: string[];
  /** Hidden entirely when empty, per the design — see the note above. */
  allSets: SetChip[];
  /** What 「直近1ヶ月」 is measured from. An argument so it can be frozen. */
  now: Date;
  matchCount: number;
  weakCount: number;
  /** 苦手のみ can only be honoured once the progress map has arrived. */
  weakState: 'ready' | 'loading' | 'error';
  onChange: (next: PracticeFilters) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const update = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const active = activeQuickRange(filters, now);

  // A quick range clears any end the learner had set: 「直近1ヶ月」 means
  // "since that day", and leaving an old end in place would silently produce a
  // window that is neither what was asked for nor visible as a mistake.
  const applyQuickRange = (key: (typeof QUICK_RANGES)[number]['key']) =>
    onChange(
      active === key
        ? { ...filters, from: '', to: '' }
        : { ...filters, from: quickRangeStart(key, now), to: '' },
    );

  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-card bg-card p-6 shadow-panel">
      <header>
        <h1 className="font-display text-2xl font-bold">{MODE_TITLE[mode]}</h1>
        <p className="mt-1 text-sm text-muted">{MODE_NOTE[mode]}</p>
      </header>

      {allSets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">単語集</p>
          <div className="flex flex-wrap gap-1.5">
            {allSets.map((set) => (
              <button
                key={set.id}
                type="button"
                aria-pressed={filters.sets.includes(set.id)}
                onClick={() => update('sets', toggle(filters.sets, set.id))}
                className={chipClass(filters.sets.includes(set.id))}
              >
                {set.name}
                <span className="ml-1.5 opacity-70">{set.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">タグ</p>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={filters.tags.includes(tag)}
                onClick={() => update('tags', toggle(filters.tags, tag))}
                className={chipClass(filters.tags.includes(tag))}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted">JLPTレベル</p>
        <div className="flex flex-wrap gap-1.5">
          {JLPT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={filters.jlpt.includes(level)}
              onClick={() => update('jlpt', toggle(filters.jlpt, level))}
              className={chipClass(filters.jlpt.includes(level))}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] text-muted">品詞</span>
          <select
            value={filters.pos}
            onChange={(event) => update('pos', event.target.value)}
            className={selectClass}
          >
            <option value="">すべて</option>
            {POS.map((part) => (
              <option key={part} value={part}>
                {part}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">語種</span>
          <select
            value={filters.origin}
            onChange={(event) => update('origin', event.target.value)}
            className={selectClass}
          >
            <option value="">すべて</option>
            {WORD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {origin}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted">学習日</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              aria-pressed={active === range.key}
              onClick={() => applyQuickRange(range.key)}
              className={chipClass(active === range.key)}
            >
              直近{range.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] text-muted">開始日</span>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => update('from', event.target.value)}
              className={selectClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-muted">終了日</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => update('to', event.target.value)}
              className={selectClass}
            />
          </label>
        </div>
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3 rounded-panel bg-bg-alt px-4">
        <span className="text-sm font-medium">
          苦手な語のみ
          <span className="ml-2 text-xs text-muted">
            {weakState === 'ready'
              ? `${weakCount} 語`
              : weakState === 'loading'
                ? '読み込み中…'
                : '記録を読み込めませんでした'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={filters.weakOnly}
          disabled={weakState !== 'ready'}
          onChange={(event) => update('weakOnly', event.target.checked)}
          className="h-5 w-5 accent-[var(--c-accent)]"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm" role="status">
          <strong className="tabular-nums">{matchCount}</strong> 件が対象
          {matchCount === 0 && <span className="ml-2 text-danger">条件に合う語がありません</span>}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-pill px-4 text-sm text-muted hover:bg-bg-alt"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={matchCount === 0}
            className="min-h-10 rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            開始する
          </button>
        </div>
      </div>
    </section>
  );
}
