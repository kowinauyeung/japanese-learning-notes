import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserProfileDraft } from '@/domain/user';
import { userRepository } from '@/lib/backend';
import { captureLoadFailure, isUnreachable } from '@/lib/loadError';
import type { LoadFailure } from '@/lib/loadError';
import { useRetryOnReconnect } from '@/lib/retryOnReconnect';
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
  const [successfulLoadFor, setSuccessfulLoadFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<LoadFailure | null>(null);

  /** Which walk is allowed to publish its result — see `EntriesProvider`'s. */
  const walk = useRef(0);

  /**
   * Re-read the profile, creating it on first sign-in if `get` finds nothing.
   * Deliberately does not raise `loading` — see the effect below.
   */
  const refresh = useCallback(async () => {
    setSuccessfulLoadFor(null);
    const mine = (walk.current += 1);
    try {
      const stored = await userRepository.get(uid);
      let next = stored;
      if (!next) {
        const draft: UserProfileDraft = {
          nickname: defaults.nickname,
          language: defaults.language,
          translationLanguage: defaults.translationLanguage,
          theme: defaults.theme,
        };
        await userRepository.save(uid, draft);
        next = (await userRepository.get(uid)) ?? defaults;
      }
      // Cleared here, not eagerly — see the same comment on `EntriesProvider`.
      if (walk.current === mine) {
        setStoredProfile(next);
        setError(null);
        setSuccessfulLoadFor(uid);
      }
    } catch (cause) {
      console.error(cause);
      if (walk.current === mine) setError(captureLoadFailure(cause, 'load.settings'));
    } finally {
      if (walk.current === mine) setLoading(false);
    }
  }, [uid, defaults]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  /**
   * Gated on `load.settings` specifically, not just "an error exists": `error`
   * also carries a failed `save` (`load.settingsSave`/`load.unreachableSave`),
   * and `refresh()` would silently clear that banner on the next reconnect —
   * telling the reader nothing is wrong when their edit was never committed.
   * Denial is excluded for the same reason as `EntriesProvider`'s guard: not
   * cleared by reconnecting.
   */
  useRetryOnReconnect(
    error !== null && error.fallback === 'load.settings' && isUnreachable(error.cause),
    successfulLoadFor === uid,
    refresh,
  );

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
        setSuccessfulLoadFor(null);
        const stored = await userRepository.get(uid);
        if (stored) setStoredProfile(stored);
        setSuccessfulLoadFor(uid);
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
