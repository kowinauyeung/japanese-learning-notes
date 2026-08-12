import { useId } from 'react';
import { PitchAccent } from '@/components/PitchAccent';
import { moraCount } from '@/lib/mora';
import { Field, inputClass } from './fields';

/**
 * Why a value is refused, in the words that say what to change.
 *
 * `accentPattern` returns `null` for three unrelated reasons, and naming the
 * mora count for all of them is true and useless: typing `2.5` against たまご
 * answered "たまご は3拍です", which is a fact about the word rather than about
 * the mistake.
 */
function reason(value: number, kana: string): string | null {
  if (!kana) return 'アクセントを入れるには読み方（かな）が必要です。';
  if (!Number.isInteger(value)) return '拍の番号なので、整数で入れてください。';
  if (value < 0) return '0（平板）以上で入れてください。';
  const mora = moraCount(kana);
  if (value > mora) return `${kana} は${mora}拍です。`;
  return null;
}

/**
 * アクセント — the mora the pitch drops after, with the reading it applies to
 * shown underneath so the number can be checked rather than trusted.
 *
 * The range rule is enforced here and not in the sanitiser, because the bound is
 * the mora count of a sibling field the user is editing: rejecting it on read
 * would delete a correct value the moment the kana were shortened. What this
 * cannot do is stop a save — `draftError` does that, and showing a message was
 * once mistaken for refusing the value.
 *
 * Only the input goes inside `Field`, which renders a `<label>`. The notation
 * and the message are siblings: nested in the label they join the input's
 * accessible name, so a screen reader announced "アクセント任意・下がる拍
 * 2（中高）たまご" and the name changed on every keystroke.
 */
export function PitchAccentField({
  kana,
  value,
  onChange,
}: {
  /** The kana the accent describes — see `accentKana`. Empty when the word has not said. */
  kana: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const errorId = useId();
  const mora = moraCount(kana);
  const message = value === null ? null : reason(value, kana);

  return (
    <div className="space-y-1">
      <Field label="アクセント" hint="任意・下がる拍">
        <input
          type="number"
          min={0}
          max={mora || undefined}
          step={1}
          value={value ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            // A number input reports '' both for empty and for a half-typed
            // value the browser cannot parse ('-', '2e'). Both mean "nothing to
            // store" — the alternative is writing 0, which is 平板 and a claim.
            if (raw === '') return onChange(null);
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
          placeholder={kana ? `0〜${mora}` : '読み方を先に'}
          aria-invalid={message !== null}
          aria-describedby={message === null ? undefined : errorId}
          className={inputClass}
        />
      </Field>

      {value !== null && message === null && (
        <PitchAccent kana={kana} pitchAccent={value} className="block font-display text-lg" />
      )}

      {message !== null && (
        <p id={errorId} className="text-[11px] text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
