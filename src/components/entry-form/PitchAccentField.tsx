import { useId } from 'react';
import { PitchAccent } from '@/components/PitchAccent';
import { useI18n } from '@/i18n/context';
import { localizeFormError } from '@/i18n/localizeFormError';
import { accentProblem, moraCount } from '@/lib/mora';
import { Field, inputClass } from './fields';

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
  const { t } = useI18n();
  const errorId = useId();
  const mora = moraCount(kana);
  const problem = value === null ? null : accentProblem(value, kana);
  const message = problem === null ? null : localizeFormError(problem, t);

  return (
    <div className="space-y-1">
      <Field label={t('form.pitchAccent')} hint={t('form.dropMora')}>
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
          placeholder={kana ? `0〜${mora}` : t('form.readingFirst')}
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
