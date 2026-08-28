import { Link } from 'react-router-dom';
import type { WordSet } from '@/domain/wordSet';
import { useI18n } from '@/i18n/context';

/**
 * One 単語集 in the list.
 *
 * A full-width row rather than a grid cell. A set is identified by prose — a
 * name and a description, both of them sentences rather than words — and a
 * 240px column clamped each of them to two lines that ended mid-phrase. The
 * row gives the name the whole width, so the clamp is reached by long sets
 * only, and puts the count where every row has it in the same place.
 *
 * `count` is passed in rather than read off `set.entryIds.length`, because the
 * two disagree once a word in the set has been deleted — see `membersOf`. The
 * caller resolves the members, so the row shows the number the detail page
 * will actually list.
 */
export function WordSetCard({ set, count }: { set: WordSet; count: number }) {
  const { t } = useI18n();
  return (
    <Link
      to={`/wordsets/${set.id}`}
      className="flex min-w-0 items-center gap-4 overflow-hidden rounded-card bg-card p-4 shadow-panel transition hover:bg-bg-alt"
    >
      <div className="min-w-0 flex-1">
        {/* Two lines, not one: a set name is chosen prose rather than a single
            word, so the second line often carries the half that distinguishes
            two sets. Unclamped it reached eight lines, which at full width is
            a row tall enough to push the next set off the screen. */}
        <h2 className="line-clamp-2 font-display text-lg font-bold">{set.name}</h2>
        {set.description && (
          <p className="prose-cjk mt-1 line-clamp-2 text-sm text-muted">{set.description}</p>
        )}
      </div>
      {/* `shrink-0` and no wrapping: the count is the one thing a reader scans
          down the column for, so it holds the right edge whatever the name
          beside it does. */}
      <p className="shrink-0 text-xs text-muted tabular-nums">{t('wordSets.count', { count })}</p>
    </Link>
  );
}
