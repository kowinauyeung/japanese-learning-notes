import { createContext, useContext } from 'react';
import type { UserProfile, UserProfileDraft } from '@/domain/user';
import type { LoadFailure } from '@/lib/loadError';

export interface UserSettingsValue {
  profile: UserProfile;
  loading: boolean;
  saving: boolean;
  error: LoadFailure | null;
  preview: (draft: UserProfileDraft | null) => void;
  save: (draft: UserProfileDraft) => Promise<void>;
}

export const UserSettingsContext = createContext<UserSettingsValue | null>(null);

export function useUserSettings(): UserSettingsValue {
  const value = useContext(UserSettingsContext);
  if (!value) throw new Error('useUserSettings must be used inside <UserSettingsProvider>');
  return value;
}
