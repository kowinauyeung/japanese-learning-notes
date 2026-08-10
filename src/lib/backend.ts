import type {
  AuthPort,
  EntryRepository,
  ProgressRepository,
  WordSetRepository,
} from '@/domain/ports';
import { firebaseAuth } from '@/infra/firebase/authAdapter';
import { db } from '@/infra/firebase/client';
import { createEntryRepository } from '@/infra/firebase/entryRepo';
import { createProgressRepository } from '@/infra/firebase/progressRepo';
import { createWordSetRepository } from '@/infra/firebase/wordSetRepo';

/**
 * The single point where the app names its adapters.
 *
 * Everything above this line talks to `@/domain/ports`; everything below it is
 * `@/infra/firebase`. Keeping the wiring in one module means swapping the
 * datasource is one file, and it gives the end-to-end build a seam it can
 * replace without any production code knowing tests exist:
 * `vite build --mode e2e` aliases this module to `backend.e2e.ts`, so the
 * in-memory adapters are only ever resolvable in that build and cannot reach a
 * real bundle.
 */

export const authPort: AuthPort = firebaseAuth;

export const entryRepositoryFor = (uid: string): EntryRepository => createEntryRepository(db, uid);

export const progressRepositoryFor = (uid: string): ProgressRepository =>
  createProgressRepository(db, uid);

export const wordSetRepositoryFor = (uid: string): WordSetRepository =>
  createWordSetRepository(db, uid);
