import { Ruby } from '@/components/Ruby';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { entrySummary } from '@/lib/contentLang';

export function EntryCard({ entry }: { entry: Entry }) {
  const entryLabel = useEntryLabel();
  const summary = entrySummary(entry);

  return (
    <VocabLink
      entryId={entry.id}
      className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-card bg-card p-4 shadow-panel transition hover:-translate-y-0.5"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        {/* `min-w-0` and `line-clamp-1` together, and neither is enough alone: a
            flex item defaults to `min-width: auto`, so without the first it
            refuses to shrink below its content and pushes the JLPT pill out of
            the card, and without the second a long headword grows the card to
            eight lines and drags the whole grid row up with it. One line rather
            than two because the headword is the card's identity — a truncated
            one is still recognisable, and a card whose height varies with it is
            not a grid. */}
        <Ruby
          headword={entry.headword}
          reading={entry.reading}
          className="has-ruby min-w-0 truncate font-display text-xl font-bold"
        />
        <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
          {entry.jlpt}
        </span>
      </div>

      <p className="prose-cjk line-clamp-2 text-sm text-muted" lang={summary.lang}>
        {summary.text}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {entry.pos.slice(0, 2).map((part) => (
          <span key={part} className="rounded-pill bg-bg-alt px-2 py-0.5 text-[11px] text-muted">
            {entryLabel(part)}
          </span>
        ))}
        {entry.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-pill px-1 text-[11px] text-accent">
            #{tag}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-muted tabular-nums">{entry.learnedOn}</span>
      </div>
    </VocabLink>
  );
}
