import { segmentFurigana } from '@/lib/furigana';

/**
 * Furigana aligned to the characters it reads: one <ruby> per kanji run, with
 * okurigana rendered as plain text between them, so each annotation centres
 * over its own base rather than over the whole word.
 *
 * The caller's classes go on a wrapper, never on <ruby> itself: overriding the
 * display of a ruby element drops it out of the ruby formatting context, and
 * the browser then lays <rt> out as ordinary inline text beside the word
 * instead of above it.
 */
export function Ruby({
  headword,
  reading,
  className,
}: {
  headword: string;
  reading: string;
  className?: string;
}) {
  const segments = segmentFurigana(headword, reading);

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.rt ? (
          <ruby key={index}>
            {segment.base}
            <rt>{segment.rt}</rt>
          </ruby>
        ) : (
          <span key={index}>{segment.base}</span>
        ),
      )}
    </span>
  );
}
