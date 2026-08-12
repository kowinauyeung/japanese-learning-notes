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
  reading,
  pitchAccent,
  className,
}: {
  reading: string;
  pitchAccent: number;
  className?: string;
}) {
  const shape = pitchShape(reading, pitchAccent);
  if (shape.length === 0) return null;

  return (
    <span className={className}>
      <span className="text-muted tabular-nums">{accentLabel(pitchAccent, reading)}</span>{' '}
      <span className="whitespace-nowrap">
        {shape.map((mora, index) => (
          <span
            key={index}
            className={[
              'inline-block border-t-2 border-r-2 border-transparent px-px',
              mora.high && 'border-t-current',
              mora.drop && 'border-r-current',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {mora.mora}
          </span>
        ))}
      </span>
    </span>
  );
}
