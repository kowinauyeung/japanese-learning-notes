import { siteTitle } from '@/lib/build';
import { projectId } from '@/lib/env';
import { useI18n } from './context';

/** `語彙庭`, or `[DEV]語彙庭` on any build that is not the production site. */
export function useBrandName(): string {
  const { t } = useI18n();
  return siteTitle(t('brand.name'), projectId);
}
