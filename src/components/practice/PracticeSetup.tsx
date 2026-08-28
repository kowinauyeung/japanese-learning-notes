import { chipClass, DateControl, SelectControl } from '@/components/controls';
import { JLPT_LEVELS, POS, WORD_ORIGINS } from '@/domain/entry';
import type { PracticeMode } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import type { MessageKey } from '@/i18n/messages';
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

const MODES = [
  { mode: 'flashcard', label: 'nav.flashcards' },
  { mode: 'dictation', label: 'nav.dictation' },
] satisfies ReadonlyArray<{ mode: PracticeMode; label: MessageKey }>;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

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
  recentTags,
  allSets,
  now,
  matchCount,
  weakCount,
  weakState,
  onChange,
  onModeChange,
  onStart,
  onCancel,
}: {
  mode: PracticeMode;
  filters: PracticeFilters;
  /**
   * A recency-biased sample, not every tag in the notebook — see
   * `src/lib/tags.ts`. Unlike Browse there is no search box here to fall back
   * on, but that is deliberate: scoping a practice session to a specific tag
   * is a narrower ask than finding one word, and a word set already exists
   * for "the exact group I want to practice" — see `wordSets.title` above.
   */
  recentTags: string[];
  /** Hidden entirely when empty, per the design — see the note above. */
  allSets: SetChip[];
  /** What 「直近1ヶ月」 is measured from. An argument so it can be frozen. */
  now: Date;
  matchCount: number;
  weakCount: number;
  /**
   * 苦手のみ can only be honoured once the progress map has arrived.
   *
   * The failed case carries the message rather than a bare `'error'` tag:
   * `progressError` is a `LoadFailure` that can be a denial, unreachable, or
   * generic, and only the caller has translated it — collapsing it to a tag
   * here would put the same hard-coded sentence on screen regardless of which
   * one it was (#24).
   */
  weakState: 'ready' | 'loading' | { error: string };
  onChange: (next: PracticeFilters) => void;
  /**
   * Switching drill keeps the filters, which is the whole reason this is a
   * callback rather than a link: the route remounts on `mode`, so the caller
   * carries the current filters into the new URL.
   */
  onModeChange: (mode: PracticeMode) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const entryLabel = useEntryLabel();
  const update = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const active = activeQuickRange(filters, now);
  const selectedHiddenTags = filters.tags.filter((tag) => !recentTags.includes(tag));

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
      <header className="space-y-3">
        {/* The screen is 「練習」 and the drill is a choice inside it, so the
            heading names the screen: the mode is already announced by the
            selected tab below, and printing it twice was what a title plus a
            switch would do. */}
        <h1 className="font-display text-2xl font-bold">{t('nav.practice')}</h1>
        {/*
          The two drills, as one choice rather than two destinations.
          They differ only in what a card asks for, and everything below this
          row — the sets, the tags, the level, the dates — is the same question
          in both. The phone's navigation has one 練習 tab for that reason, so
          this is also the only way to reach the other drill there.
        */}
        <div
          role="tablist"
          aria-label={t('nav.practice')}
          className="flex gap-1 rounded-pill bg-bg-alt p-1"
        >
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="tab"
              aria-selected={mode === option.mode}
              onClick={() => onModeChange(option.mode)}
              className={`min-h-11 flex-1 rounded-pill px-3 text-sm font-semibold transition ${
                mode === option.mode ? 'bg-card text-ink shadow-panel' : 'text-muted'
              }`}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
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

      {(selectedHiddenTags.length > 0 || recentTags.length > 0) && (
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
            {recentTags.map((tag) => (
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
          <SelectControl
            value={filters.pos}
            onChange={(event) => update('pos', event.target.value)}
          >
            <option value="">{t('vocabulary.all')}</option>
            {POS.map((part) => (
              <option key={part} value={part}>
                {entryLabel(part)}
              </option>
            ))}
          </SelectControl>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.origin')}</span>
          <SelectControl
            value={filters.origin}
            onChange={(event) => update('origin', event.target.value)}
          >
            <option value="">{t('vocabulary.all')}</option>
            {WORD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {entryLabel(origin)}
              </option>
            ))}
          </SelectControl>
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
            <DateControl
              value={filters.from}
              onChange={(event) => update('from', event.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-muted">{t('vocabulary.endDate')}</span>
            <DateControl
              value={filters.to}
              onChange={(event) => update('to', event.target.value)}
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
                : weakState.error}
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
