import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserProfileDraft } from '@/domain/user';
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
  const [profile, setProfile] = useState(defaults);
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
        if (!cancelled) setProfile(next);
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled) setError(loadErrorMessage(cause, '設定を読み込めませんでした。'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, defaults]);

  useEffect(() => {
    applyThemePreference(profile.theme);
    if (profile.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => applyThemePreference('system');
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, [profile.theme]);

  const save = useCallback(
    async (draft: UserProfileDraft) => {
      setSaving(true);
      setError(null);
      try {
        await userRepository.save(uid, draft);
        const stored = await userRepository.get(uid);
        if (stored) setProfile(stored);
      } catch (cause) {
        console.error(cause);
        setError('設定を保存できませんでした。');
        throw cause;
      } finally {
        setSaving(false);
      }
    },
    [uid],
  );

  const value = useMemo(
    () => ({ profile, loading, saving, error, save }),
    [profile, loading, saving, error, save],
  );
  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}
