import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MemberList } from '@/components/wordsets/MemberList';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { WordSetEditModal } from '@/components/wordsets/WordSetEditModal';
import type { WordSetDraft } from '@/domain/wordSet';
import { useEntries } from '@/lib/entries';
import { EMPTY_FILTERS } from '@/lib/filters';
import type { Filters } from '@/lib/filters';
import { useListDrag } from '@/lib/listDrag';
import type { DragSource, DropAt } from '@/lib/listDrag';
import {
  insertMemberAt,
  membersOf,
  reorderMembers,
  toDraft,
  withoutMember,
} from '@/lib/wordSetMembers';
import { useWordSets } from '@/lib/wordSets';

/** The two drag lists on this page, named once so a typo cannot silently miss. */
const MEMBERS = 'members';
const CANDIDATES = 'candidates';

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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  /**
   * The order a drop just produced, shown before the write comes back.
   *
   * Without it a reorder snaps to the stored order for as long as the round
   * trip takes and then jumps to the new one, which reads as the drop having
   * failed and been retried. Tagged with the set it belongs to, so a navigation
   * mid-write cannot paint one set's order onto another's.
   */
  const [pending, setPending] = useState<{ setId: string; entryIds: string[] } | null>(null);

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
      // Cleared whether or not it worked: the refresh above has already put the
      // stored order back in hand, and on a failure that stored order is the
      // honest thing to show.
      setPending(null);
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

  const allTags = useMemo(
    () =>
      [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b, 'ja')),
    [entries],
  );

  /** The order on screen: what a drop just produced, or what is stored. */
  const entryIds =
    pending && set && pending.setId === set.id ? pending.entryIds : (set?.entryIds ?? []);

  /**
   * Send an order, unless it is the one already showing.
   *
   * The no-change guard is what stops a drop back onto the row it came from
   * from costing a write, which is most of the drops a hesitant hand makes.
   */
  const applyOrder = (next: readonly string[]) => {
    if (!set || busy) return;
    if (next.length === entryIds.length && next.every((value, at) => value === entryIds[at]))
      return;
    setPending({ setId: set.id, entryIds: [...next] });
    void write({ ...toDraft(set), entryIds: [...next] });
  };

  const drag = useListDrag((source: DragSource, at: DropAt) => {
    // Dropping back into the notebook does nothing. Removing by dragging a word
    // out would be the symmetric gesture, and is deliberately absent: a slip
    // would then take a word out of the set silently, where 削除 is a button
    // that says what it does.
    if (at.list !== MEMBERS) return;
    applyOrder(
      source.list === MEMBERS
        ? reorderMembers(entryIds, source.index, at.index)
        : insertMemberAt(entryIds, source.id, at.index),
    );
  });

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

  const members = membersOf({ ...set, entryIds }, entries);

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

      {/* 収録語 above 単語を探す: the set is what this page is about, and the
          notebook below it is the source you pull from. It also puts the drop
          target above its drag sources, so a drag is upward and does not fight
          the page scrolling down. */}
      <MemberList
        members={members}
        list={MEMBERS}
        drag={drag}
        busy={busy}
        onRemove={(entryId) =>
          void write({ ...toDraft(set), entryIds: withoutMember(entryIds, entryId) })
        }
        onMoveBy={(index, delta) =>
          applyOrder(reorderMembers(entryIds, index, delta < 0 ? index - 1 : index + 2))
        }
      />

      <MemberPicker
        set={set}
        entries={entries}
        allTags={allTags}
        filters={filters}
        list={CANDIDATES}
        drag={drag}
        busy={busy}
        onFiltersChange={setFilters}
        onAdd={(entryId) => applyOrder(insertMemberAt(entryIds, entryId, entryIds.length))}
      />

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

      {/* What follows the finger. `pointer-events-none` is not styling: the
          drop target is found with elementFromPoint, and a ghost under the
          cursor would be the only thing it ever finds. */}
      {drag.dragging && drag.point && (
        <div
          aria-hidden
          style={{ left: drag.point.x, top: drag.point.y }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent px-3 py-1 font-display text-xs font-bold text-on-accent shadow-panel"
        >
          {entries.find((entry) => entry.id === drag.dragging?.id)?.headword}
        </div>
      )}
    </div>
  );
}
