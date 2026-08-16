import { loadErrorMessage, type LoadFailure } from '@/lib/loadError';
import { useI18n } from './context';

export function useLoadErrorMessage(failure: LoadFailure | null): string | null {
  const { t } = useI18n();
  return failure
    ? loadErrorMessage(failure.cause, t(failure.fallback), t('load.accessDenied'))
    : null;
}
