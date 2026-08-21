import { loadErrorMessage, type LoadFailure } from '@/lib/loadError';
import { useI18n } from './context';

export function useLoadErrorMessage(failure: LoadFailure | null): string | null {
  const { t } = useI18n();
  return failure
    ? loadErrorMessage(
        failure.cause,
        t(failure.fallback),
        t('load.accessDenied'),
        // Not a constant: a failed save says so, and only the caller knows
        // which operation it was. See `captureLoadFailure`.
        t(failure.offline),
      )
    : null;
}
