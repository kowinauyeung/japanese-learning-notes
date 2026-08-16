import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MemberList } from '@/components/wordsets/MemberList';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { PickerToolbar } from '@/components/wordsets/PickerToolbar';
import { WordSetEditModal } from '@/components/wordsets/WordSetEditModal';
import type { WordSetDraft } from '@/domain/wordSet';
import { useEntries } from '@/lib/entries';
import { EMPTY_FILTERS } from '@/lib/filters';
import type { Filters } from '@/lib/filters';
import { useListDrag } from '@/lib/listDrag';
import type { DragSource, DropAt } from '@/lib/listDrag';
import {
  candidatesFor,
  insertMemberAt,
  membersOf,
  reorderMembers,
  storedIndexFor,
  toDraft,
  withMember,
  withoutMember,
  withoutMembers,
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
  const { entries, loading: entriesLoading, error: entriesError } = useEntries();

  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /**
   * The words 表示中の N 語を削除 is asking about, or null when it has not been
   * pressed.
   *
   * It confirms and 削除 on a single row does not, because they are different
   * sizes of mistake: one row is one press to put back, and the whole list
   * takes the study order with it — an order that took dragging to build and
   * that nothing records anywhere else.
   */
  const [clearing, setClearing] = useState<string[] | null>(null);
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
      // Cleared whether or not it worked, and correct either way for the same
      // reason: `set.entryIds` was never mutated locally, so dropping `pending`
      // falls back to what is stored. On the failing path the refresh above did
      // not run at all -- it is the absence of a local mutation that saves this,
      // not the refresh.
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

  const members = set ? membersOf({ ...set, entryIds }, entries) : [];

  /**
   * A row index from either list, in the coordinates the stored array uses.
   *
   * Every index arriving from the DOM counts rendered rows, and `members` is
   * shorter than `entryIds` whenever the set holds a word that has since been
   * deleted. See `storedIndexFor` — untranslated, a drag moves the wrong id.
   */
  const visibleIds = members.map((entry) => entry.id);
  const stored = (visible: number) => storedIndexFor(entryIds, visibleIds, visible);

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
        ? reorderMembers(entryIds, stored(source.index), stored(at.index))
        : insertMemberAt(entryIds, source.id, stored(at.index)),
    );
  });

  if (loading || entriesLoading)
    return <p className="py-16 text-center text-sm text-muted">読み込み中…</p>;
  /**
   * The notebook's error counts as much as the set's. Every count and every row
   * on this page is derived from `entries` rather than from the set, so a failed
   * notebook load with only `error` surfaced renders a set that looks empty
   * instead of a page that says it could not load.
   */
  if (error || entriesError)
    return <p className="py-16 text-center text-sm text-danger">{error ?? entriesError}</p>;

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

  // Against the order on screen, not the stored one, so a word just dropped in
  // leaves the list it was dragged from in the same render.
  const candidates = candidatesFor({ ...set, entryIds }, entries, filters);

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

      <PickerToolbar filters={filters} allTags={allTags} onChange={setFilters} />

      {/*
        Source on the left, destination on the right, and both bounded so they
        scroll inside themselves. Stacked one above the other they drifted
        apart as soon as either had a few rows in it, and a drag whose start and
        end are never on screen together cannot be performed. Below the nav
        breakpoint they stack, which is why the cap is a fraction of the
        viewport rather than a fixed height: two of them still fit.
      */}
      <div className="grid gap-4 nav:grid-cols-2">
        <div className="flex max-h-[46vh] min-h-64 nav:max-h-[62vh]">
          <MemberPicker
            shown={candidates.shown}
            total={candidates.total}
            list={CANDIDATES}
            drag={drag}
            busy={busy}
            onAdd={(entryId) => applyOrder(insertMemberAt(entryIds, entryId, entryIds.length))}
            onAddAll={(ids) =>
              applyOrder(ids.reduce<readonly string[]>((so, id) => withMember(so, id), entryIds))
            }
          />
        </div>
        <div className="flex max-h-[46vh] min-h-64 nav:max-h-[62vh]">
          <MemberList
            members={members}
            list={MEMBERS}
            drag={drag}
            busy={busy}
            onRemove={(entryId) =>
              void write({ ...toDraft(set), entryIds: withoutMember(entryIds, entryId) })
            }
            onRemoveAll={setClearing}
            onMoveBy={(index, delta) =>
              applyOrder(
                reorderMembers(entryIds, stored(index), stored(delta < 0 ? index - 1 : index + 2)),
              )
            }
          />
        </div>
      </div>

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
        open={clearing !== null}
        title="表示中の単語を削除"
        message={`この単語集から ${clearing?.length ?? 0} 語を外しますか？\n単語そのものは削除されません。`}
        confirmLabel="外す"
        busy={busy}
        error={writeError}
        onClose={() => setClearing(null)}
        onConfirm={() => {
          if (clearing) applyOrder(withoutMembers(entryIds, clearing));
          setClearing(null);
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
