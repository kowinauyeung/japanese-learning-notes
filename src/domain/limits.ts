/**
 * How long a user-written value may be.
 *
 * These live in `src/domain` because they are a statement about the notebook,
 * not about a particular form: the entry form, the JSON import path and the
 * security rules all have to agree on them, and two of those three cannot see
 * a React component.
 *
 * **The numbers are deliberately smaller than `firestore.rules` allows.** Rules
 * exist for one threat — an authenticated account writing as much as it likes
 * on somebody else's bill — and they are deployed by a different job than the
 * client (`deploy-prod.yml` runs rules before hosting). Pinning the two to the
 * same number means every tightening ships a window where the new client's
 * writes are refused by the old rules, or the reverse. So rules stay roughly
 * three to five times looser and answer the megabyte; these answer the product.
 *
 * **Nothing here is a minimum except `required`.** A Japanese entry of one
 * character is ordinary — 魚 is a word — so a minimum above 1 would refuse real
 * notes to catch nothing. Requiredness is expressed by `draftError`, not here.
 *
 * The nested limits are the ones that matter most, and the reason is in
 * `firestore.rules`: rules cannot iterate a list, so `senses[3].description` is
 * invisible to them at any size. Everything under `senses`, `examples`,
 * `related`, `context`, `usage` and `posInfo` is bounded here or nowhere.
 */

import { TAG_MAX_LENGTH } from './common';

/** Longest headword this expects. 龍の宮の乙姫の元結の上の外し, the longest word
 *  a Japanese dictionary carries, is 14 characters. */
const HEADWORD = 20;

export const ENTRY_LIMITS = {
  headword: HEADWORD,
  /** Kana runs longer than the kanji it reads — roughly 2.5 kana per kanji. */
  reading: 50,
  /** 登録形 is the same word in dictionary form, so it is the same size. */
  citationForm: HEADWORD,
  definition: 1000,
  definitionSub: 1000,
  source: 100,
  /** The mora a pitch drops after. `accentProblem` checks it against the
   *  reading as well; this is only the ceiling for a reading not yet typed. */
  pitchAccent: 99,
  pos: 18,
  tags: 10,
  senses: { count: 10, label: 50, description: 500, text: 300 },
  examples: { count: 20, text: 300 },
  related: { count: 20, headword: HEADWORD, note: 200 },
  context: 500,
  usage: 500,
  posInfo: { title: 50, rows: 20, label: 30, value: 200 },
  /**
   * The notebook records words already met, so a learning date in the future is
   * not a note that arrived early — it is a typo, and every dashboard count and
   * heatmap cell reads `learnedOn`. The lower bound is a floor on the same
   * typo from the other side (`0202-06-24` for `2026-06-24`).
   */
  learnedOnFrom: '2000-01-01',
} as const;

/**
 * The tags field is a single text input holding space-separated tags, so what
 * `maxLength` has to bound there is the joined string, not one tag. `parseTags`
 * splits it back apart and `invalidTags` still refuses an over-long individual
 * tag — this only stops the box itself growing without limit.
 */
export const TAG_INPUT_MAX = ENTRY_LIMITS.tags * (TAG_MAX_LENGTH + 1);

export const WORD_SET_LIMITS = {
  name: 30,
  description: 200,
  entryIds: 500,
  topics: 10,
} as const;

export const USER_LIMITS = { nickname: 30 } as const;

/** Built by the client from tag and set names, so it inherits their length. */
export const SESSION_LIMITS = { filterLabel: 200 } as const;

/**
 * Values that are never stored, and still need a ceiling.
 *
 * A search box writes into the URL, and the JSON paste box is handed straight
 * to `JSON.parse` — a five-megabyte paste freezes the tab before any of the
 * validation below it ever runs.
 */
export const INPUT_LIMITS = {
  search: 100,
  dictationAnswer: ENTRY_LIMITS.reading,
  importWord: HEADWORD,
  importLanguage: 32,
  importSource: ENTRY_LIMITS.source,
  importOriginal: ENTRY_LIMITS.context,
  /** Characters, not bytes: this is `String.length` on the pasted text. */
  jsonPaste: 100_000,
} as const;
