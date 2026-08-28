import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WordSetCard } from '@/components/wordsets/WordSetCard';
import { WORD_SET_LIMITS } from '@/domain/limits';
import { useI18n } from '@/i18n/context';
import { localizeFormError } from '@/i18n/localizeFormError';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { useEntries } from '@/lib/entries';
import { wordSetError } from '@/lib/wordSetDraft';
import { membersOf } from '@/lib/wordSetMembers';
import { useWordSets } from '@/lib/wordSets';

/**
 * 単語集 — the list, and the one field it takes to start one.
 *
 * Creating asks for a name and nothing else, then opens the new set: a 単語集
 * is only worth anything once it has words in it, and the screen that adds
 * them is the one after this. Description and the rest are edited there.
 */
export function Component() {
  const { sets, loading, error, refresh, repository } = useWordSets();
  const { entries, loading: entriesLoading, error: entriesError } = useEntries();
  const errorMessage = useLoadErrorMessage(error);
  const entriesErrorMessage = useLoadErrorMessage(entriesError);
  const navigate = useNavigate();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Memoised because the name box above re-renders this list on every
  // keystroke, and resolving members walks the whole notebook once per set.
  const counts = useMemo(
    () => new Map(sets.map((set) => [set.id, membersOf(set, entries).length])),
    [sets, entries],
  );

  const create = async () => {
    const trimmed = name.trim();
    if (creating) return;

    // maxLength stops the box growing; this is what refuses the write. See
    // `wordSetError` for why the two are not the same guard.
    const invalid = wordSetError({ name: trimmed, description: '' });
    if (invalid) return setCreateError(localizeFormError(invalid, t));

    setCreating(true);
    setCreateError(null);
    try {
      const id = await repository.create({
        name: trimmed,
        description: '',
        entryIds: [],
        level: '',
        topics: [],
      });
      setName('');
      // The detail page reads the set out of this same list and has no fetch of
      // its own, so a create that does not refresh lands on 見つかりません for a
      // set that was written perfectly well.
      await refresh();
      void navigate(`/wordsets/${id}`);
    } catch (cause) {
      console.error(cause);
      setCreateError(t('wordSets.createError'));
    } finally {
      setCreating(false);
    }
  };

  if (loading || entriesLoading)
    return <p className="py-16 text-center text-sm text-muted">{t('vocabulary.loading')}</p>;
  // The notebook's error counts as much as the list's: every card's count is
  // resolved against `entries`, so a failed load with only `error` surfaced
  // renders each set as 0 語 rather than saying it could not be read.
  if (errorMessage || entriesErrorMessage)
    return (
      <p className="py-16 text-center text-sm text-danger">{errorMessage ?? entriesErrorMessage}</p>
    );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">{t('wordSets.title')}</h1>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
        className="flex flex-wrap items-center gap-2 rounded-card bg-card p-4 shadow-panel"
      >
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setCreateError(null);
          }}
          maxLength={WORD_SET_LIMITS.name}
          placeholder={t('wordSets.newName')}
          aria-label={t('wordSets.newName')}
          aria-invalid={createError ? true : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-pill border border-line bg-bg px-4 text-sm text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={creating}
          className="min-h-11 rounded-pill bg-accent px-6 text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {creating ? t('wordSets.creating') : t('wordSets.create')}
        </button>
        {createError && <p className="w-full text-xs text-danger">{createError}</p>}
      </form>

      {sets.length ? (
        /* One set per row, full width. A grid of 240px cells clamped the name
           and the description of every set to two short lines, and a reader
           scanning for one set was reading the halves that all of them share.
           There are rarely enough sets for the density to be worth that. */
        <div className="flex flex-col gap-3">
          {sets.map((set) => (
            <WordSetCard key={set.id} set={set} count={counts.get(set.id) ?? 0} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted">{t('wordSets.empty')}</p>
      )}
    </div>
  );
}
