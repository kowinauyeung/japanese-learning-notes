import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EntryCard } from '@/components/browse/EntryCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MemberList } from '@/components/wordsets/MemberList';
import { MemberPicker } from '@/components/wordsets/MemberPicker';
import { PickerToolbar } from '@/components/wordsets/PickerToolbar';
import { SetDescription } from '@/components/wordsets/SetDescription';
import { WordSetEditModal } from '@/components/wordsets/WordSetEditModal';
import { WORD_SET_LIMITS } from '@/domain/limits';
import type { WordSetDraft } from '@/domain/wordSet';
import { useI18n } from '@/i18n/context';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
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
  const errorMessage = useLoadErrorMessage(error);
  const entriesErrorMessage = useLoadErrorMessage(entriesError);
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  /**
   * Which of the two screens this page is: the set as it is read, or the set
   * as it is built.
   *
   * Reading a 単語集 and editing one are different tasks, and the page used to
   * only offer the second — two drag panels, a filter toolbar and a delete
   * button, on the way to every word in the set. Opening a set to study it now
   * lands on the words themselves, drawn exactly as they are on 単語一覧, and
   * the machinery for changing what is in the set is behind 編集.
   */
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  /** The name-and-description dialog. Reachable from edit mode only. */
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
    /*
      Every mutation on this page routes through here — add one, add all the
      filtered candidates, drag to reorder, remove — so this is the only place
      the size of a set has to be checked. Reordering and removing cannot grow
      it, which leaves 追加 as the one path that can reach the limit and the one
      that gets an error worth reading.

      Refusing rather than truncating, unlike `summariseSession`: the order of
      `entryIds` is the study order, so dropping the tail would silently discard
      whichever words happened to sort last, and the user asked for all of them.
    */
    if (draft.entryIds.length > WORD_SET_LIMITS.entryIds) {
      setWriteError(t('wordSets.tooManyMembers', { max: WORD_SET_LIMITS.entryIds }));
      setPending(null);
      return false;
    }
    setBusy(true);
    setWriteError(null);
    try {
      await repository.update(set.id, draft);
      await refresh();
      return true;
    } catch (cause) {
      console.error(cause);
      setWriteError(t('wordSets.saveError'));
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
      setDeleteError(t('wordSets.deleteError'));
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
    return <p className="py-16 text-center text-sm text-muted">{t('vocabulary.loading')}</p>;
  /**
   * The notebook's error counts as much as the set's. Every count and every row
   * on this page is derived from `entries` rather than from the set, so a failed
   * notebook load with only `error` surfaced renders a set that looks empty
   * instead of a page that says it could not load.
   */
  if (errorMessage || entriesErrorMessage)
    return (
      <p className="py-16 text-center text-sm text-danger">{errorMessage ?? entriesErrorMessage}</p>
    );

  if (!set) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">{t('wordSets.notFound')}</p>
        <Link to="/wordsets" className="mt-2 inline-block text-sm text-accent underline">
          {t('wordSets.back')}
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
        ← {t('wordSets.back')}
      </Link>

      <header className="rounded-card bg-card p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold [overflow-wrap:anywhere]">
              {set.name}
              <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                {t('wordSets.count', { count: members.length })}
              </span>
            </h1>
            {set.description && <SetDescription description={set.description} />}
          </div>
          {/* One control in view mode and two in edit mode, both in the same
              corner: 編集 is the door in, 完了 is the door out, and the dialog
              that renames the set sits behind the door rather than beside it.
              Naming and reordering are the same job — changing the set — and
              splitting them across two always-visible buttons made the page
              ask which kind of edit before it asked whether to edit at all. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {mode === 'edit' && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-9 rounded-pill bg-bg-alt px-4 text-xs font-semibold text-ink"
              >
                {t('wordSets.details')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
              className={
                mode === 'edit'
                  ? 'min-h-9 rounded-pill bg-accent px-4 text-xs font-semibold text-on-accent'
                  : 'min-h-9 rounded-pill bg-bg-alt px-4 text-xs font-semibold text-ink'
              }
            >
              {mode === 'edit' ? t('wordSets.done') : t('common.edit')}
            </button>
          </div>
        </div>
      </header>

      {writeError && <p className="text-sm text-danger">{writeError}</p>}

      {mode === 'edit' ? (
        <>
          <PickerToolbar filters={filters} allTags={allTags} onChange={setFilters} />

          {/*
            Source on the left, destination on the right, and both bounded so
            they scroll inside themselves. Stacked one above the other they
            drifted apart as soon as either had a few rows in it, and a drag
            whose start and end are never on screen together cannot be
            performed. Below the nav breakpoint they stack, which is why the cap
            is a fraction of the viewport rather than a fixed height: two of
            them still fit.
          */}
          <div className="grid min-w-0 gap-4 nav:grid-cols-2">
            <div className="flex max-h-[46vh] min-h-64 min-w-0 nav:max-h-[62vh]">
              <MemberPicker
                shown={candidates.shown}
                total={candidates.total}
                list={CANDIDATES}
                drag={drag}
                busy={busy}
                onAdd={(entryId) => applyOrder(insertMemberAt(entryIds, entryId, entryIds.length))}
                onAddAll={(ids) =>
                  applyOrder(
                    ids.reduce<readonly string[]>((so, id) => withMember(so, id), entryIds),
                  )
                }
              />
            </div>
            <div className="flex max-h-[46vh] min-h-64 min-w-0 nav:max-h-[62vh]">
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
                    reorderMembers(
                      entryIds,
                      stored(index),
                      stored(delta < 0 ? index - 1 : index + 2),
                    ),
                  )
                }
              />
            </div>
          </div>

          {/* Inside edit mode with the rest of what changes the set. On the
              reading screen it was a red button under every word in the set,
              one press from a list nothing else in the app can rebuild. */}
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="min-h-10 w-full rounded-pill bg-danger-soft text-sm font-semibold text-danger"
          >
            {t('wordSets.deleteSet')}
          </button>
        </>
      ) : members.length ? (
        /* The same card and the same grid as 単語一覧, deliberately: a word in
           a set is the same word, and a reader who has learned to scan those
           cards should not have to learn a second shape here. The order is the
           set's own — `members` follows `entryIds` — which the grid preserves
           left to right. */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {members.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted">{t('wordSets.emptyView')}</p>
      )}

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
        title={t('wordSets.clearTitle')}
        message={t('wordSets.clearMessage', { count: clearing?.length ?? 0 })}
        confirmLabel={t('wordSets.remove')}
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
        title={t('wordSets.deleteTitle')}
        message={t('wordSets.deleteMessage', { name: set.name })}
        confirmLabel={t('wordSets.deleteConfirm')}
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
          className="pointer-events-none fixed z-50 max-w-[min(20rem,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 truncate rounded-pill bg-accent px-3 py-1 font-display text-xs font-bold text-on-accent shadow-panel"
        >
          {entries.find((entry) => entry.id === drag.dragging?.id)?.headword}
        </div>
      )}
    </div>
  );
}
