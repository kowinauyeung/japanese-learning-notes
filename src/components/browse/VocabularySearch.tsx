import { useEffect, useRef, useState } from 'react';
import { INPUT_LIMITS } from '@/domain/limits';
import { useI18n } from '@/i18n/context';

export function VocabularySearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const composing = useRef(false);
  const justCommitted = useRef<string | null>(null);
  const [compositionValue, setCompositionValue] = useState<string | null>(null);

  // Once the URL has accepted the completed composition, its value becomes
  // the source of truth again. Until then the draft prevents React's controlled
  // input reconciliation from replacing the browser's IME candidate text.
  useEffect(() => {
    if (!composing.current) setCompositionValue(null);
  }, [value]);

  return (
    <input
      type="search"
      maxLength={INPUT_LIMITS.search}
      value={compositionValue ?? value}
      onChange={(event) => {
        const next = event.currentTarget.value;
        if (composing.current) {
          setCompositionValue(next);
          return;
        }
        if (justCommitted.current === next) {
          justCommitted.current = null;
          return;
        }
        justCommitted.current = null;
        setCompositionValue(null);
        onChange(next);
      }}
      onCompositionStart={(event) => {
        composing.current = true;
        justCommitted.current = null;
        setCompositionValue(event.currentTarget.value);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        justCommitted.current = event.currentTarget.value;
        setCompositionValue(event.currentTarget.value);
        onChange(event.currentTarget.value);
      }}
      placeholder={t('vocabulary.searchPlaceholder')}
      className="min-h-12 w-full rounded-pill border border-line bg-card px-5 text-sm text-ink placeholder:text-muted"
    />
  );
}
