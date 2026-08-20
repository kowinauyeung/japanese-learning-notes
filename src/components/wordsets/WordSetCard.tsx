import { Link } from 'react-router-dom';
import type { WordSet } from '@/domain/wordSet';
import { useI18n } from '@/i18n/context';

/**
 * One 単語集 in the list.
 *
 * `count` is passed in rather than read off `set.entryIds.length`, because the
 * two disagree once a word in the set has been deleted — see `membersOf`. The
 * caller resolves the members, so the card shows the number the detail page
 * will actually list.
 */
export function WordSetCard({ set, count }: { set: WordSet; count: number }) {
  const { t } = useI18n();
  return (
    <Link
      to={`/wordsets/${set.id}`}
      className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-panel transition hover:-translate-y-0.5"
    >
      {/* Two lines, not one: a set name is chosen prose rather than a single
          word, so the second line often carries the half that distinguishes two
          sets. Unclamped it reached eight lines and set the height of every
          card in the row — a grid of short sets with a band of empty space
          through it. */}
      <h2 className="line-clamp-2 font-display text-lg font-bold">{set.name}</h2>
      {set.description && (
        <p className="prose-cjk line-clamp-2 text-sm text-muted">{set.description}</p>
      )}
      <p className="mt-auto text-xs text-muted tabular-nums">{t('wordSets.count', { count })}</p>
    </Link>
  );
}
