import { useState } from 'react';
import type { RelatedActions } from '@/components/detail/EntryBody';
import type { Entry, EntryDraft } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
import { useEntries } from '@/lib/entries';
import { findByHeadword } from '@/lib/related';
import { useUserSettings } from '@/lib/userSettingsContext';

/**
 * Adding a 関連語 as a note of its own, from the note that lists it.
 *
 * Shared by the detail page and the dialog, which differ only in where the add
 * form is rendered and in what 開く does — so both are the caller's.
 *
 * Every piece of state is keyed to the note it was started from. Both screens
 * keep this component mounted while the note on screen changes — the dialog
 * opening another word, the page following 開く — and a confirmation or an open
 * form carried across would describe a list the reader is no longer looking at.
 */
export function useRelatedQuickAdd(parent: Entry | undefined, onOpen: (id: string) => void) {
  const { entries } = useEntries();
  const { t } = useI18n();
  const { profile } = useUserSettings();
  const [adding, setAdding] = useState<{ parentId: string; headword: string } | null>(null);
  const [added, setAdded] = useState<{ parentId: string; id: string } | null>(null);

  const current = (state: { parentId: string } | null) =>
    parent !== undefined && state?.parentId === parent.id;

  // Read back from the notebook rather than remembered from the row: the reader
  // may have corrected the headword in the form before saving.
  const addedEntry = current(added) ? entries.find((entry) => entry.id === added?.id) : undefined;

  const actions: RelatedActions = {
    existing: (headword) => findByHeadword(entries, headword),
    onAdd: (headword) => parent && setAdding({ parentId: parent.id, headword }),
    onOpen,
    added: addedEntry ? { headword: addedEntry.headword, id: addedEntry.id } : null,
  };

  const formOpen = current(adding);
  const prefill: Pick<EntryDraft, 'headword' | 'source'> | undefined =
    formOpen && adding && parent
      ? {
          headword: adding.headword,
          source: t('vocabulary.relatedSource', { headword: parent.headword }),
        }
      : undefined;

  return {
    actions,
    form: {
      open: formOpen,
      prefill,
      translationLanguage: profile.translationLanguage,
      onClose: () => setAdding(null),
      onSaved: (id: string) => parent && setAdded({ parentId: parent.id, id }),
    },
    /** Drops an open form, for a screen that closed without the form's own onClose. */
    clear: () => {
      if (adding) setAdding(null);
    },
  };
}
