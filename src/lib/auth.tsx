import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/domain/ports';
import { firebaseAuth } from '@/infra/firebase/authAdapter';

interface AuthValue {
  user: AuthUser | null;
  /** True until the provider has restored (or ruled out) a persisted session. */
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * The composition point for authentication: the adapter is named here and
 * nowhere else, so everything downstream sees the domain `AuthUser` rather than
 * Firebase's much wider `User`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      firebaseAuth.onChange((next) => {
        setUser(next);
        setLoading(false);
      }),
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: () => firebaseAuth.signIn(),
      signOutUser: () => firebaseAuth.signOut(),
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
