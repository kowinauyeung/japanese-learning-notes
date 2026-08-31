import { createContext, useContext } from 'react';

/**
 * Split from `appUpdate.tsx` for the reason `userSettingsContext.ts` is split
 * from `userSettings.tsx`: a module that exports both a component and a hook
 * loses fast refresh for everything that imports it.
 */
export interface AppUpdateValue {
  /** A build has installed and is waiting for this session to step aside. */
  updateReady: boolean;
  /** Hand over to it. The page is replaced, so nothing follows this. */
  activate: () => void;
  /**
   * The most recent `activate()` call rejected instead of replacing the page.
   * Cleared at the start of the next attempt, so a retry that succeeds does
   * not leave a stale failure on screen.
   */
  activateFailed: boolean;
}

export const AppUpdateContext = createContext<AppUpdateValue | null>(null);

export function useAppUpdate(): AppUpdateValue {
  const value = useContext(AppUpdateContext);
  if (!value) throw new Error('useAppUpdate must be used inside <AppUpdateProvider>');
  return value;
}
