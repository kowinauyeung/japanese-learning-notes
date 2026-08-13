import { describe, expect, it, vi } from 'vitest';
import type { Page, PageQuery } from '@/domain/ports';
import {
  deleteEverything,
  exportEverything,
  exportFilename,
  NothingDeleted,
} from '@/lib/accountData';

/** A repository holding `count` rows and serving them `PAGE` at a time. */
const paged = <T>(items: T[]) => {
  const list = vi.fn((q: PageQuery): Promise<Page<T>> => {
    const start = q.cursor ? Number(q.cursor) : 0;
    const slice = items.slice(start, start + q.limit);
    const next = start + q.limit;
    return Promise.resolve({ items: slice, cursor: next < items.length ? String(next) : null });
  });
  return list;
};

const rows = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

const ports = (entryCount: number, setCount: number, sessionCount: number) => {
  const entries = { list: paged(rows(entryCount, 'e')), remove: vi.fn(() => Promise.resolve()) };
  const wordSets = { list: paged(rows(setCount, 's')), remove: vi.fn(() => Promise.resolve()) };
  const progress = {
    listAll: vi.fn(() => Promise.resolve([{ entryId: 'e-0' }])),
    listSessions: paged(rows(sessionCount, 'p')),
    removeAll: vi.fn(() => Promise.resolve()),
  };
  const auth = {
    reauthenticate: vi.fn(() => Promise.resolve()),
    deleteAccount: vi.fn(() => Promise.resolve()),
  };
  // Only the methods under test are implemented; the ports are wider.
  return {
    entries,
    wordSets,
    progress,
    auth,
    profile: { displayName: 'k' },
  } as unknown as Parameters<typeof exportEverything>[0] & Parameters<typeof deleteEverything>[0];
};

/**
 * The defect an export is most likely to ship with: stopping at the first page.
 *
 * Every screen in the app is correct while reading one page — History shows
 * recent sessions and says so — and an export that does the same is wrong in a
 * way nobody can see. The file downloads, opens, and looks complete.
 */
describe('exportEverything', () => {
  it('reads every page of sessions, not the first one', async () => {
    const p = { ...ports(0, 0, 250), appVersion: '0.1.0' };
    const bundle = await exportEverything(p);

    expect(bundle.practiceSessions).toHaveLength(250);
  });

  it('reads every page of entries and word sets too', async () => {
    const bundle = await exportEverything({ ...ports(340, 120, 0), appVersion: '0.1.0' });

    expect(bundle.entries).toHaveLength(340);
    expect(bundle.wordSets).toHaveLength(120);
  });

  it('carries a schema version, so a future importer can tell what it is reading', async () => {
    const bundle = await exportEverything({
      ...ports(1, 0, 0),
      appVersion: '0.1.0',
      now: new Date('2026-08-13T00:00:00Z'),
    });

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.appVersion).toBe('0.1.0');
    expect(bundle.exportedAt).toBe('2026-08-13T00:00:00.000Z');
  });

  /** A cursor that stops advancing must not spin forever on a user's quota. */
  it('gives up rather than looping on a cursor that never ends', async () => {
    const stuck = {
      list: vi.fn(() => Promise.resolve({ items: [{ id: 'x' }], cursor: 'always' })),
      remove: vi.fn(),
    };
    const p = ports(0, 0, 0);
    await expect(
      exportEverything({ ...p, entries: stuck as never, appVersion: '0.1.0' }),
    ).rejects.toThrow(/エクスポート/);
  });
});

describe('exportFilename', () => {
  it('names the file by the day it was taken', () => {
    expect(exportFilename(new Date('2026-08-13T12:00:00Z'))).toBe('goitei-export-2026-08-13.json');
  });
});

/**
 * Firestore does not cascade. Deleting the parent leaves every subcollection
 * addressable, so the rows have to go first and be counted.
 */
describe('deleteEverything', () => {
  it('removes every row it found, across pages', async () => {
    const p = ports(140, 30, 0);
    const removed = await deleteEverything(p);

    expect(removed).toEqual({ entries: 140, wordSets: 30 });
    expect((p.entries.remove as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(140);
    expect((p.wordSets.remove as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(30);
  });

  /**
   * The defect this shipped with: it drained words and word sets and stopped,
   * while the button, the dialog and the privacy policy all promised more. So
   * "deleting the account" signed the user out and left their practice history
   * for the next sign-in with the same Google account — and a session record
   * carries the ids it got wrong and a label built from the user's own tags.
   */
  it('removes the practice history too, which is the sensitive half', async () => {
    const p = ports(1, 1, 40);
    await deleteEverything(p);

    expect((p.progress.removeAll as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('deletes the account itself, not only its data', async () => {
    const p = ports(0, 0, 0);
    await deleteEverything(p);

    expect((p.auth.deleteAccount as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  /**
   * Order matters in one direction only: once the account is gone there is no
   * session left to delete anything with, so it has to be last.
   */
  it('deletes the account after the data, not before', async () => {
    const order: string[] = [];
    const p = ports(1, 0, 0);
    (p.progress.removeAll as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('data');
      return Promise.resolve();
    });
    (p.auth.deleteAccount as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('account');
      return Promise.resolve();
    });

    await deleteEverything(p);

    expect(order).toEqual(['data', 'account']);
  });

  /**
   * The state the order above cannot survive on its own.
   *
   * Providers refuse a sensitive operation on a stale session, so with the
   * account deleted last a session old enough for `auth/requires-recent-login`
   * succeeded at every irreversible step and failed only at the one that needed
   * proving. The user pressed delete and was left holding an account with
   * nothing in it — the worst of both outcomes, and unrecoverable.
   *
   * Proving the session first turns that into a popup.
   */
  it('refuses to delete anything at all when the session cannot be proved', async () => {
    const p = ports(5, 5, 5);
    // A code `reauthenticateWithPopup` actually raises. It is the one the
    // adapter chose that call for: the user picked a different Google account,
    // and the caller is about to delete everything belonging to this one.
    (p.auth.reauthenticate as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('different account'), { code: 'auth/user-mismatch' }),
    );

    await expect(deleteEverything(p)).rejects.toBeInstanceOf(NothingDeleted);

    expect((p.entries.remove as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((p.wordSets.remove as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((p.progress.removeAll as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((p.auth.deleteAccount as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  /**
   * The state a user must never be told is safe.
   *
   * `auth/requires-recent-login` is `CREDENTIAL_TOO_OLD_LOGIN_AGAIN`, which the
   * backend returns for a sensitive operation — and the only sensitive
   * operation here is `deleteAccount()`, which runs last. So this code can only
   * reach a caller *after* every word set, entry, session and the progress map
   * are already gone. Reading it as "the re-authentication was refused" and
   * reporting 「データは削除されていません」 is the exact inverse of what
   * happened, and it is unrecoverable: the reader retries later into an account
   * holding nothing.
   *
   * The window is real rather than theoretical — the removals are one sequential
   * `await` each, and nothing bounds how long that takes.
   */
  it('does not report a late refusal as nothing having been deleted', async () => {
    const p = ports(5, 5, 5);
    (p.auth.deleteAccount as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('stale'), { code: 'auth/requires-recent-login' }),
    );

    const failure = await deleteEverything(p).catch((cause: unknown) => cause);

    expect(failure).not.toBeInstanceOf(NothingDeleted);
    // ...because plenty was.
    expect((p.entries.remove as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(5);
    expect((p.progress.removeAll as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

/**
 * A cursor that stops advancing is a query that has stopped working, and the
 * page cap alone answered that with a million document reads.
 *
 * `drain` walked to its 10,000-page limit at 100 records a page before giving
 * up — twenty times the free daily read allowance, spent proving something the
 * second page already showed. `deleteEverything` drains twice as well, so the
 * delete button reached it too.
 */
describe('drain, when the walk stops moving', () => {
  it('stops on the second page rather than after ten thousand', async () => {
    const stuck = vi.fn((_q: PageQuery) =>
      // Always more, always from the same place.
      Promise.resolve({ items: [{ id: 'e-0' }], cursor: 'same' }),
    );
    const p = ports(0, 0, 0);
    (p.entries.list as unknown) = stuck;

    await expect(exportEverything({ ...p, appVersion: '0.1.0' })).rejects.toThrow(
      'エクスポートが終わりませんでした',
    );

    // Two: the first hands out `same`, the second hands it out again and is
    // recognised. Anything higher means the cap is doing the work.
    expect(stuck.mock.calls).toHaveLength(2);
  });
});
