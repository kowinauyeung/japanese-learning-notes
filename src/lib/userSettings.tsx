import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserProfileDraft } from '@/domain/user';
import { useI18n } from '@/i18n/context';
import { userRepository } from '@/lib/backend';
import { loadErrorMessage } from '@/lib/loadError';
import { applyThemePreference } from '@/lib/theme';
import { defaultUserProfile } from '@/lib/userPreferences';
import { UserSettingsContext } from '@/lib/userSettingsContext';

export function UserSettingsProvider({
  uid,
  displayName,
  email,
  children,
}: {
  uid: string;
  displayName: string;
  email: string;
  children: ReactNode;
}) {
  return (
    <UserSettingsState key={uid} uid={uid} displayName={displayName} email={email}>
      {children}
    </UserSettingsState>
  );
}

function UserSettingsState({
  uid,
  displayName,
  email,
  children,
}: {
  uid: string;
  displayName: string;
  email: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const defaults = useMemo(
    () =>
      defaultUserProfile(
        uid,
        displayName || email.split('@')[0] || 'User',
        navigator.languages,
        localStorage.getItem('theme'),
      ),
    [uid, displayName, email],
  );
  const [storedProfile, setStoredProfile] = useState(defaults);
  const [previewDraft, setPreviewDraft] = useState<UserProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void userRepository
      .get(uid)
      .then(async (stored) => {
        if (stored) return stored;
        const draft: UserProfileDraft = {
          nickname: defaults.nickname,
          language: defaults.language,
          translationLanguage: defaults.translationLanguage,
          theme: defaults.theme,
        };
        await userRepository.save(uid, draft);
        return (await userRepository.get(uid)) ?? defaults;
      })
      .then((next) => {
        if (!cancelled) setStoredProfile(next);
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled)
          setError(loadErrorMessage(cause, t('load.settings'), t('load.accessDenied')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, defaults, t]);

  useEffect(() => {
    const profile = previewDraft ? { ...storedProfile, ...previewDraft } : storedProfile;
    applyThemePreference(profile.theme, previewDraft === null);
    if (profile.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => applyThemePreference('system', previewDraft === null);
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, [storedProfile, previewDraft]);

  const save = useCallback(
    async (draft: UserProfileDraft) => {
      setSaving(true);
      setError(null);
      try {
        await userRepository.save(uid, draft);
        const stored = await userRepository.get(uid);
        if (stored) {
          setStoredProfile(stored);
          setPreviewDraft(null);
        }
      } catch (cause) {
        console.error(cause);
        setError(t('load.settingsSave'));
        throw cause;
      } finally {
        setSaving(false);
      }
    },
    [uid, t],
  );

  const profile = useMemo(
    () => (previewDraft ? { ...storedProfile, ...previewDraft } : storedProfile),
    [storedProfile, previewDraft],
  );
  const preview = useCallback((draft: UserProfileDraft | null) => setPreviewDraft(draft), []);

  const value = useMemo(
    () => ({ profile, loading, saving, error, preview, save }),
    [profile, loading, saving, error, preview, save],
  );
  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}
