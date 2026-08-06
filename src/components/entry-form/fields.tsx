import type { ReactNode } from 'react';

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
      <span className="text-muted text-[11px]">
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
  blank = 'すべて',
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  blank?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    >
      <option value="">{blank}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
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
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{title}</legend>
      {items.map((item, index) => (
        <div key={index} className="rounded-panel border-line space-y-2 border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted text-[11px]">{index + 1}</span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="text-danger text-xs"
            >
              削除
            </button>
          </div>
          {render(item, (next) => onChange(items.map((old, i) => (i === index ? next : old))))}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, blank()])}
        className="rounded-pill bg-bg-alt text-muted hover:text-ink min-h-9 w-full text-xs font-medium"
      >
        ＋ 追加
      </button>
    </fieldset>
  );
}
