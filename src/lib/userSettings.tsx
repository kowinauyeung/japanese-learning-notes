import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserProfileDraft } from '@/domain/user';
import { userRepository } from '@/lib/backend';
import { captureLoadFailure } from '@/lib/loadError';
import type { LoadFailure } from '@/lib/loadError';
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
  const [storedProfile, setStoredProfile] = useState(defaults);
  const [previewDraft, setPreviewDraft] = useState<UserProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<LoadFailure | null>(null);

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
        if (!cancelled) setError(captureLoadFailure(cause, 'load.settings'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, defaults]);

  useEffect(() => {
    const profile = previewDraft ? { ...storedProfile, ...previewDraft } : storedProfile;
    applyThemePreference(profile.theme, previewDraft === null);
    if (profile.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => applyThemePreference('system', previewDraft === null);
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, [storedProfile, previewDraft]);

  /**
   * Two operations, and only the first one decides whether the settings were
   * saved.
   *
   * They used to share a `try`, so a `get` that failed after the transaction
   * had committed told the reader 設定を保存できませんでした and asked them to
   * try again — for a change that was already durable. Worse, the rejection
   * propagated, so `Settings.tsx` never advanced its baseline and the form went
   * on reporting unsaved changes for settings the server had. Redoing the save
   * would have worked, which is exactly why nobody would have found this: the
   * lie corrects itself the moment the reader believes it.
   *
   * `userRepository.save` resolving means the transaction committed. Past that
   * point a failure is a read failure, the draft is what is stored, and this
   * resolves.
   */
  const save = useCallback(
    async (draft: UserProfileDraft) => {
      setSaving(true);
      setError(null);
      try {
        await userRepository.save(uid, draft);
      } catch (cause) {
        console.error(cause);
        setError(captureLoadFailure(cause, 'load.settingsSave', 'load.unreachableSave'));
        setSaving(false);
        throw cause;
      }
      try {
        const stored = await userRepository.get(uid);
        if (stored) setStoredProfile(stored);
      } catch (cause) {
        console.error(cause);
        // Read wording, because a read is what failed. The server-written
        // fields — `updatedAt` — are stale until the next load; every setting
        // the reader actually chose is here in the draft.
        setStoredProfile((current) => ({ ...current, ...draft }));
        setError(captureLoadFailure(cause, 'load.settings'));
      } finally {
        // Cleared either way: the settings are saved, so a form still offering
        // to save them is describing a state that no longer exists.
        setPreviewDraft(null);
        setSaving(false);
      }
    },
    [uid],
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
