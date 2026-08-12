import { PitchAccent } from '@/components/PitchAccent';
import { accentPattern, moraCount } from '@/lib/mora';
import { Field, inputClass } from './fields';

/**
 * アクセント — the mora the pitch drops after, with the reading it applies to
 * shown underneath so the number can be checked rather than trusted.
 *
 * This is where the range rule lives, and not in the sanitiser: the bound is
 * the mora count of the reading, which the user is editing in the field above,
 * so the same value is valid or not depending on a sibling field. Enforcing it
 * on read would delete a correct value the moment the kana were shortened;
 * enforcing it here says so while there is still someone to fix it.
 */
export function PitchAccentField({
  reading,
  value,
  onChange,
}: {
  /** The kana the accent describes — the reading, or the headword when it is already kana. */
  reading: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const mora = moraCount(reading);
  const outOfRange = value !== null && accentPattern(value, mora) === null;

  return (
    <Field label="アクセント" hint="任意・下がる拍">
      <input
        type="number"
        min={0}
        max={mora || undefined}
        step={1}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          // A number input reports '' both for empty and for a half-typed value
          // the browser cannot parse ('-', '2e'). Both mean "nothing to store"
          // — the alternative is writing 0, which is 平板 and a claim.
          if (raw === '') return onChange(null);
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        placeholder={reading ? `0〜${mora}` : '読み方を先に'}
        className={inputClass}
      />

      {value !== null && !outOfRange && (
        <PitchAccent
          reading={reading}
          pitchAccent={value}
          className="mt-1 block font-display text-lg"
        />
      )}

      {outOfRange && (
        <span className="mt-1 block text-[11px] text-danger">
          {reading ? `${reading} は${mora}拍です` : '読み方が空です'}
        </span>
      )}
    </Field>
  );
}
