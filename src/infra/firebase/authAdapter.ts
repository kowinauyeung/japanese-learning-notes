import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { AuthPort, AuthUser } from '@/domain/ports';
import { auth, googleProvider } from './client';

/**
 * Firebase's `User` carries far more than the app needs and is the type most
 * likely to be missed when swapping providers, so it is narrowed here to the
 * four fields anything above this layer actually reads. Nullable strings become
 * empty ones: every consumer already falls back on blank.
 */
const toAuthUser = (user: User | null): AuthUser | null =>
  user && {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    emailVerified: user.emailVerified,
  };

export const firebaseAuth: AuthPort = {
  current: () => toAuthUser(auth.currentUser),
  onChange: (fn) => onAuthStateChanged(auth, (user) => fn(toAuthUser(user))),
  signIn: async () => {
    await signInWithPopup(auth, googleProvider);
  },
  signOut: async () => {
    await signOut(auth);
  },
};
