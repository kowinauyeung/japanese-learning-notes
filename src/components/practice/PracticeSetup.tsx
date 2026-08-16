import { JLPT_LEVELS, POS, WORD_ORIGINS } from '@/domain/entry';
import type { PracticeMode } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
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
  const { t } = useI18n();
  const entryLabel = useEntryLabel();
  const update = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const active = activeQuickRange(filters, now);
  const selectedHiddenTags = filters.tags.filter((tag) => !allTags.includes(tag));

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
        <h1 className="font-display text-2xl font-bold">
          {t(mode === 'flashcard' ? 'practice.flashcard' : 'practice.dictation')}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t(
            mode === 'flashcard'
              ? 'practice.flashcardDescription'
              : 'practice.dictationDescription',
          )}
        </p>
      </header>

      {allSets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">{t('practice.wordSets')}</p>
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

      {(selectedHiddenTags.length > 0 || allTags.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">{t('practice.tags')}</p>
          {selectedHiddenTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">{t('practice.selected')}</span>
              {selectedHiddenTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed="true"
                  onClick={() => update('tags', toggle(filters.tags, tag))}
                  className={chipClass(true)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
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
        <p className="text-[11px] text-muted">{t('vocabulary.jlptLevel')}</p>
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
          <span className="text-[11px] text-muted">{t('vocabulary.partOfSpeech')}</span>
          <select
            value={filters.pos}
            onChange={(event) => update('pos', event.target.value)}
            className={selectClass}
          >
            <option value="">{t('vocabulary.all')}</option>
            {POS.map((part) => (
              <option key={part} value={part}>
                {entryLabel(part)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.origin')}</span>
          <select
            value={filters.origin}
            onChange={(event) => update('origin', event.target.value)}
            className={selectClass}
          >
            <option value="">{t('vocabulary.all')}</option>
            {WORD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {entryLabel(origin)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted">{t('practice.studyDate')}</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              aria-pressed={active === range.key}
              onClick={() => applyQuickRange(range.key)}
              className={chipClass(active === range.key)}
            >
              {t('practice.recent', {
                range: t(
                  range.key === 'week'
                    ? 'practice.rangeWeek'
                    : range.key === 'month'
                      ? 'practice.rangeMonth'
                      : 'practice.rangeYear',
                ),
              })}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] text-muted">{t('vocabulary.startDate')}</span>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => update('from', event.target.value)}
              className={selectClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-muted">{t('vocabulary.endDate')}</span>
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
          {t('practice.weakOnly')}
          <span className="ml-2 text-xs text-muted">
            {weakState === 'ready'
              ? t('vocabulary.resultCount', { count: weakCount })
              : weakState === 'loading'
                ? t('vocabulary.loading')
                : t('practice.weakLoadingError')}
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
          {t('practice.matches', { count: matchCount })}
          {matchCount === 0 && <span className="ml-2 text-danger">{t('practice.noMatches')}</span>}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-pill px-4 text-sm text-muted hover:bg-bg-alt"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={matchCount === 0}
            className="min-h-10 rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {t('practice.start')}
          </button>
        </div>
      </div>
    </section>
  );
}
