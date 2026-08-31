import { JAPANESE } from '@/lib/contentLang';
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
 *
 * That wrapper carries `lang="ja"`, emitted here rather than passed in for the
 * same reason `.has-accent` is emitted inside `PitchAccent`: a headword is
 * Japanese at every one of the nine call sites, and a hint a caller has to
 * remember is a hint that is one new screen away from being forgotten. Without
 * it a reader whose interface is Traditional Chinese gets their vocabulary
 * drawn in Chinese character forms — see the `:lang()` rules in
 * `src/index.css`.
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
    <span className={className} lang={JAPANESE}>
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
