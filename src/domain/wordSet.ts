import type { Attribution, IsoDateTime } from './common';
import type { JlptLevel } from './entry';

/**
 * A user-organised list of entries, independent of tags.
 *
 * Membership lives here rather than on the entry (`Entry.wordSets` in the
 * original schema, dropped). Four things pushed it this way: the order of
 * `entryIds` *is* the study order and an entry-side array cannot express it;
 * publishing needs the entry list anyway; `entryCount` is `entryIds.length`
 * rather than a count query; and deleting a set is one write instead of N.
 *
 * The reverse question — which sets contain this entry, for the detail page —
 * is a memory filter over the user's own sets, which are few and already
 * loaded. It needs no query.
 */
export interface WordSet {
  /** Auto-id. The old slug-as-id is gone: slugs collide across users. */
  id: string;
  ownerUid: string;
  name: string;
  description: string;
  /** Ordered. Duplicates are not meaningful; the write path dedupes. */
  entryIds: string[];

  // --- discovery metadata, surfaced on a published set
  level: JlptLevel | '';
  /** 旅行, 熟語, 擬態語 … free-form, the same shape as tags. */
  topics: string[];

  // --- publication, mirroring Entry
  publishedId: string | null;
  publishedVersion: number;
  copiedFrom: Attribution | null;

  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Fields the user may send when creating or editing a set. */
export type WordSetDraft = Omit<
  WordSet,
  'id' | 'ownerUid' | 'publishedId' | 'publishedVersion' | 'copiedFrom' | 'createdAt' | 'updatedAt'
>;
