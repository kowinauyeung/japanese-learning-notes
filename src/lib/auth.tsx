import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/domain/ports';
import { authPort } from '@/lib/backend';

interface AuthValue {
  user: AuthUser | null;
  /** True until the provider has restored (or ruled out) a persisted session. */
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Holds the session for the app. The adapter behind `authPort` is chosen in
 * `@/lib/backend` and never named here, so everything downstream sees the domain
 * `AuthUser` rather than Firebase's much wider `User`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      authPort.onChange((next) => {
        setUser(next);
        setLoading(false);
      }),
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: () => authPort.signIn(),
      signOutUser: () => authPort.signOut(),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
