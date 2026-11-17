import { useId } from 'react';
import { chipClass } from '@/components/controls';
import { useI18n } from '@/i18n/context';

/**
 * Rendered beside the 出典 `Field`, never inside it: `Field` is a `<label>`,
 * and a button inside one becomes a second labelable descendant competing with
 * the input for the label.
 */
export function RecentSources({
  sources,
  value,
  onPick,
  disabled,
}: {
  sources: string[];
  value: string;
  onPick: (source: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const labelId = useId();
  if (sources.length === 0) return null;

  const current = value.trim();
  return (
    <div className="space-y-1">
      <p id={labelId} className="text-[11px] text-muted">
        {t('form.recentSources')}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <button
            key={source}
            type="button"
            aria-pressed={source === current}
            disabled={disabled}
            onClick={() => onPick(source)}
            title={source}
            className={`${chipClass(source === current)} disabled:opacity-50`}
          >
            {source}
          </button>
        ))}
      </div>
    </div>
  );
}
