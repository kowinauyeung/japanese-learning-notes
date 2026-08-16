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

export function Text({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}

export function Area({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
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

/** Add/remove wrapper for the repeatable sections (senses, examples, related). */
export function RepeatableList<T>({
  title,
  items,
  onChange,
  blank,
  render,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  blank: () => T;
  render: (item: T, update: (next: T) => void) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{title}</legend>
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
        onClick={() => onChange([...items, blank()])}
        className="min-h-9 w-full rounded-pill bg-bg-alt text-xs font-medium text-muted hover:text-ink"
      >
        {t('form.addRow')}
      </button>
    </fieldset>
  );
}
