import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/context';

export const inputClass =
  'rounded-panel border-line bg-bg text-ink placeholder:text-muted min-h-10 w-full border px-3 text-sm';

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
 */
export function Text({
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
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
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      maxLength={maxLength}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} prose-cjk py-2 leading-relaxed`}
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
    <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">{blank}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {formatOption(option)}
        </option>
      ))}
    </select>
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
