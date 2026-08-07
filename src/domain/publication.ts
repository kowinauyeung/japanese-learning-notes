/**
 * Published copies.
 *
 * A published copy is an **immutable snapshot**, not a live view. The owner
 * presses republish to refresh it; nothing syncs automatically. Adopting one
 * deep-copies it into the adopter's own account with no reference back, so
 * deleting the source account cannot break or blank out somebody else's copy.
 *
 * A consequence worth stating: **no user ever writes to another user's
 * document.** A copy counter was designed here and dropped — it made an
 * "immutable" snapshot mutable, and it was the only rule in the whole model
 * that needed a cross-user write. If a feature seems to need one, that is the
 * signal it belongs in the search index or a backend, not in a rules exception.
 *
 * The other consequence, accepted knowingly: a takedown removes the snapshot
 * but cannot reach copies people have already adopted.
 */

import type { IsoDateTime } from './common';
import type { Entry } from './entry';
import type { WordSet } from './wordSet';

interface PublishedMeta {
  ownerUid: string;
  /**
   * Denormalised so a feed page does not join `users/{uid}` once per row.
   * Renaming therefore has to fan out over the owner's own published
   * documents — all of which they own, so it needs no backend.
   */
  ownerNickname: string;
  /** The private document this was snapshotted from. */
  sourceId: string;
  publishedAt: IsoDateTime;
  version: number;
  /**
   * headword + reading + definition + definitionSub, flattened at publish time.
   *
   * Firestore cannot do substring or full-text search at all, so the snapshot
   * *is* the search document: an external index reads this field. Adding it
   * later would mean republishing every snapshot in existence, which is why it
   * is here before any of the search work starts.
   */
  searchText: string;
}

/** Fields that only make sense on the private side. */
type PrivateOnly = 'ownerUid' | 'publishedId' | 'publishedVersion' | 'copiedFrom';

/**
 * `copiedFrom` is deliberately not carried through: a published set shows its
 * own creator, and attribution chains beyond one hop are not a requirement.
 */
export type PublicEntry = Omit<Entry, PrivateOnly> & PublishedMeta;

export type PublicSet = Omit<WordSet, PrivateOnly | 'entryIds'> &
  PublishedMeta & {
    /** `entryIds.length` at publish time; the entries live in a subcollection. */
    entryCount: number;
  };
