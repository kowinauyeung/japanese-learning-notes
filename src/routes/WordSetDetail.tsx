import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Ruby } from '@/components/Ruby';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { WordSetEditModal } from '@/components/wordsets/WordSetEditModal';
import type { WordSetDraft } from '@/domain/wordSet';
import { useEntries } from '@/lib/entries';
import { membersOf, toDraft, withMember, withoutMember } from '@/lib/wordSetMembers';
import { useWordSets } from '@/lib/wordSets';

/**
 * One 単語集: what is in it, and everything that changes it.
 *
 * Every edit here is a whole-document write of `entryIds`, because that is
 * what the port offers and what the order in it is worth — Firestore's array
 * union would add a member without saying where. The cost is that two writes
 * in flight at once would have the second overwrite the first, which is what
 * `busy` exists to prevent.
 */
export function Component() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sets, loading, error, refresh, repository } = useWordSets();
  const { entries, loading: entriesLoading } = useEntries();

  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const set = sets.find((item) => item.id === id);

  const write = async (draft: WordSetDraft): Promise<boolean> => {
    if (!set || busy) return false;
    setBusy(true);
    setWriteError(null);
    try {
      await repository.update(set.id, draft);
      await refresh();
      return true;
    } catch (cause) {
      console.error(cause);
      setWriteError('保存できませんでした。もう一度お試しください。');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Leave only once the delete and the refresh have both landed. A failed
   * refresh means the set is gone from Firestore but still in the cached list,
   * and a list that still shows it is worse than staying here with an error.
   */
  const confirmDelete = async () => {
    if (!set) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await repository.remove(set.id);
      await refresh();
      void navigate('/wordsets', { replace: true });
    } catch (cause) {
      console.error(cause);
      setDeleteError('削除できませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  if (loading || entriesLoading)
    return <p className="py-16 text-center text-sm text-muted">読み込み中…</p>;
  if (error) return <p className="py-16 text-center text-sm text-danger">{error}</p>;

  if (!set) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">単語集が見つかりません</p>
        <Link to="/wordsets" className="mt-2 inline-block text-sm text-accent underline">
          単語集一覧へ戻る
        </Link>
      </div>
    );
  }

  const members = membersOf(set, entries);

  return (
    <div className="space-y-4">
      <Link to="/wordsets" className="inline-block text-sm text-muted hover:text-ink">
        ← 単語集一覧へ戻る
      </Link>

      <header className="rounded-card bg-card p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">
              {set.name}
              <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                {members.length} 語
              </span>
            </h1>
            {set.description && (
              <p className="prose-cjk mt-2 text-sm text-muted">{set.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-9 shrink-0 rounded-pill bg-bg-alt px-4 text-xs font-semibold text-ink"
          >
            編集
          </button>
        </div>
      </header>

      {writeError && <p className="text-sm text-danger">{writeError}</p>}

      <MemberPicker
        set={set}
        entries={entries}
        busy={busy}
        onAdd={(entryId) =>
          void write({ ...toDraft(set), entryIds: withMember(set.entryIds, entryId) })
        }
      />

      <section className="space-y-2 rounded-card bg-card p-5 shadow-panel">
        <h2 className="text-sm font-semibold">収録語</h2>
        {members.length ? (
          <ul className="divide-y divide-line">
            {members.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <Link to={`/vocabulary/${entry.id}`} className="min-w-0 truncate">
                  <Ruby
                    headword={entry.headword}
                    reading={entry.reading}
                    className="has-ruby font-display text-base font-bold"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    void write({ ...toDraft(set), entryIds: withoutMember(set.entryIds, entry.id) })
                  }
                  disabled={busy}
                  className="min-h-9 shrink-0 rounded-pill bg-danger-soft px-4 text-xs font-semibold text-danger disabled:opacity-60"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted">
            まだ単語がありません。上の検索から追加してください。
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        className="min-h-10 w-full rounded-pill bg-danger-soft text-sm font-semibold text-danger"
      >
        この単語集を削除
      </button>

      <WordSetEditModal
        open={editing}
        set={set}
        busy={busy}
        error={writeError}
        onClose={() => setEditing(false)}
        onSave={(fields) => {
          void write({ ...toDraft(set), ...fields }).then((ok) => {
            if (ok) setEditing(false);
          });
        }}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="単語集を削除"
        message={`「${set.name}」を削除しますか？\n収録されている単語そのものは削除されません。`}
        confirmLabel="削除する"
        busy={busy}
        error={deleteError}
        onClose={() => {
          setConfirmingDelete(false);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
