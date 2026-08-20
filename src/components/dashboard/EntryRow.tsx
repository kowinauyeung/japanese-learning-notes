import { Ruby } from '@/components/Ruby';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';

export function EntryRow({ entry }: { entry: Entry }) {
  return (
    <VocabLink
      entryId={entry.id}
      className="flex items-center gap-3 rounded-panel px-3 py-2.5 transition hover:bg-bg-alt"
    >
      {/* Without `min-w-0` this row is what widens the dashboard past the
          viewport: a flex item will not shrink below its content by default, so
          an unbroken headword sets the row's width, the row sets the page's
          scroll width, and a phone zooms the whole document out to fit it —
          which is why the symptom shows up as the *entire dashboard* rendering
          as a narrow column, nowhere near the row that caused it.

          `max-w-1/2` on top of that, because shrinking is not the same as
          yielding: with only `min-w-0` the two text items divide the row in
          proportion to their content, so a 400-character headword still takes
          almost all of it and leaves the definition an ellipsis. Half is the
          most the identity of the row is worth. */}
      <Ruby
        headword={entry.headword}
        reading={entry.reading}
        className="has-ruby line-clamp-1 max-w-1/2 min-w-0 font-display text-base font-bold"
      />
      <span className="prose-cjk min-w-0 flex-1 truncate text-sm text-muted">
        {entry.senses[0]?.description || entry.definition}
      </span>
      <span className="shrink-0 text-xs text-muted tabular-nums">{entry.learnedOn}</span>
    </VocabLink>
  );
}
