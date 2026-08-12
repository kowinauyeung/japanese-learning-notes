import { accentLabel, pitchShape } from '@/lib/mora';

/**
 * The kana with the pitch line over it, the way a dictionary draws it.
 *
 * The line is a border on each mora rather than a drawn overline, so it tracks
 * the text at any font size: a top border marks the high register, and a right
 * border on the last high mora is the fall. Every mora carries a transparent
 * border of the same width whether or not it is high, because a border that
 * appears only on some of them changes their height and the kana stop sitting
 * on one baseline.
 *
 * Renders nothing when the number does not fit the reading — see `pitchShape`.
 */
export function PitchAccent({
  kana,
  pitchAccent,
  className,
}: {
  /** The kana the accent describes — see `accentKana`. */
  kana: string;
  pitchAccent: number;
  className?: string;
}) {
  const shape = pitchShape(kana, pitchAccent);
  if (shape.length === 0) return null;

  return (
    <span className={className}>
      <span className="text-muted tabular-nums">{accentLabel(pitchAccent, kana)}</span>{' '}
      <span className="whitespace-nowrap">
        {shape.map((mora, index) => (
          <span
            key={index}
            /*
             * Each side names a colour outright rather than defaulting to
             * transparent and being overridden. Both utilities set the same
             * property, so which one wins is the order Tailwind emits them in —
             * a fact about the build, invisible to jsdom, and one that a later
             * `border-2` on this element would also flip. Naming both states
             * leaves nothing to override.
             */
            className={[
              'inline-block border-t-2 border-r-2 px-px',
              mora.high ? 'border-t-current' : 'border-t-transparent',
              mora.drop ? 'border-r-current' : 'border-r-transparent',
            ].join(' ')}
          >
            {mora.mora}
          </span>
        ))}
      </span>
    </span>
  );
}
