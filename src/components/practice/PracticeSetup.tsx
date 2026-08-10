import { JLPT_LEVELS } from '@/domain/entry';
import type { PracticeMode } from '@/domain/practice';
import type { PracticeFilters } from '@/lib/practice';

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

/**
 * The screen both practice modes open on.
 *
 * 単語集 chips are in the design and are absent here: `WordSetRepository` has
 * no adapter yet, so there are no sets to show and the design says to hide the
 * row when there are none. They belong with `/wordsets`, not ahead of it.
 *
 * `matchCount` is computed by the caller rather than here, because the same
 * filtered list is what 開始する turns into the queue — recomputing it in two
 * places is how a screen ends up promising a count it does not deliver.
 */
export function PracticeSetup({
  mode,
  filters,
  allTags,
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
  matchCount: number;
  weakCount: number;
  /** 苦手のみ can only be honoured once the progress map has arrived. */
  weakState: 'ready' | 'loading' | 'error';
  onChange: (next: PracticeFilters) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-card bg-card p-6 shadow-panel">
      <header>
        <h1 className="font-display text-2xl font-bold">{MODE_TITLE[mode]}</h1>
        <p className="mt-1 text-sm text-muted">{MODE_NOTE[mode]}</p>
      </header>

      {allTags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">タグ</p>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={filters.tags.includes(tag)}
                onClick={() => set('tags', toggle(filters.tags, tag))}
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
              onClick={() => set('jlpt', toggle(filters.jlpt, level))}
              className={chipClass(filters.jlpt.includes(level))}
            >
              {level}
            </button>
          ))}
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
          onChange={(event) => set('weakOnly', event.target.checked)}
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
