import type { ReactNode } from 'react';
import { SelectControl, controlClass, textAreaClass } from '@/components/controls';
import { useI18n } from '@/i18n/context';

/**
 * Kept as a name because half the form imports it, but it is no longer this
 * file's own shape: every control in the app is sized by `src/components/controls.tsx`
 * so that a dropdown, a date field and a text box in the same row are the same box.
 */
export const inputClass = controlClass;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted">
        {label}
        {hint && <span className="ml-1 opacity-70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * `maxLength` is required rather than optional, and that is the point of it.
 *
 * It is the attribute, not the validation: the browser stops typing and pasting
 * past the limit, which is the only feedback fast enough to be useful, and it
 * has no idea what any of these fields mean. `draftSizeProblems` is what
 * actually refuses a save, because the attribute is bypassed by every path that
 * sets state without a keystroke — the JSON import above all, which builds a
 * whole draft at once and never touches an input.
 *
 * Making it required is what stops the next field being added without one. Every
 * value comes from `ENTRY_LIMITS`, so a field whose author has to name a number
 * here has to go and look at what the limit is.
 *
 * `'unbounded'` is the one deliberate exception, and it exists because the
 * attribute can *defeat* a check rather than support it. The JSON paste box is
 * refused above its limit by `jsonToDraft`, which reports the size it got — but
 * with the attribute on, the browser silently trims the paste to exactly the
 * limit first, so that branch is unreachable and the user is told their JSON
 * does not parse, about a document that was truncated mid-object. Opting out is
 * only legitimate where something else refuses the value and can say how big it
 * was.
 */
export function Text({
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  /** See `Area`: a field a request in flight is about to answer for. */
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}

export function Area({
  value,
  onChange,
  maxLength,
  rows = 3,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number | 'unbounded';
  rows?: number;
  placeholder?: string;
  /**
   * Optional, and every existing caller leaves it out. It exists because the
   * JSON panel holds fields whose value a request in flight is about to answer
   * for — editing them mid-request produces a reply to a question that is no
   * longer on screen.
   */
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      maxLength={maxLength === 'unbounded' ? undefined : maxLength}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`${textAreaClass} prose-cjk leading-relaxed`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  formatOption = (option) => option,
  blank = 'すべて',
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  formatOption?: (option: string) => string;
  blank?: string;
}) {
  return (
    <SelectControl value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{blank}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {formatOption(option)}
        </option>
      ))}
    </SelectControl>
  );
}

/**
 * Add/remove wrapper for the repeatable sections (senses, examples, related).
 *
 * `max` disables the add button rather than hiding it, and shows the count
 * beside the legend once the list is non-empty. A control that vanishes at the
 * limit reads as a bug — the user's last action made a button disappear — while
 * a disabled one next to `10 / 10` says what happened.
 *
 * This is presentation, not enforcement: `draftSizeProblems` refuses an
 * over-long list however it was built, and the JSON import builds one without
 * ever pressing this button.
 */
export function RepeatableList<T>({
  title,
  items,
  max,
  onChange,
  blank,
  render,
}: {
  title: string;
  items: T[];
  max: number;
  onChange: (items: T[]) => void;
  blank: () => T;
  render: (item: T, update: (next: T) => void) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">
        {title}
        {items.length > 0 && (
          <span className="ml-2 text-[11px] font-normal text-muted tabular-nums">
            {items.length} / {max}
          </span>
        )}
      </legend>
      {items.map((item, index) => (
        <div key={index} className="space-y-2 rounded-panel border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted">{index + 1}</span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="text-xs text-danger"
            >
              {t('form.deleteRow')}
            </button>
          </div>
          {render(item, (next) => onChange(items.map((old, i) => (i === index ? next : old))))}
        </div>
      ))}
      <button
        type="button"
        disabled={items.length >= max}
        onClick={() => onChange([...items, blank()])}
        className="min-h-9 w-full rounded-pill bg-bg-alt text-xs font-medium text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted"
      >
        {t('form.addRow')}
      </button>
    </fieldset>
  );
}
