/**
 * Canonical database schema for the vocabulary notebook.
 *
 * Designed as a general system for a Japanese learner to *record*, *review* and
 * *practise* vocabulary — not as a mirror of the original markdown notes. Where
 * the two disagree the schema wins and the migration converts or drops.
 */

import type { Attribution, IsoDate, IsoDateTime, Tag } from './common';

/**
 * Parts of speech a learner actually needs to distinguish.
 *
 * Conjugation classes are deliberately absent: サ変動詞 is a 名詞 that takes
 * する, which `posInfo` already records, so it would be a second, contradictory
 * source of truth. 形容詞/形容動詞 use the learner-facing い/な naming.
 */
export const POS = [
  '名詞',
  '代名詞',
  '動詞',
  'い形容詞',
  'な形容詞',
  '副詞',
  '連体詞',
  '接続詞',
  '感動詞',
  '助詞',
  '助動詞',
  '接頭辞',
  '接尾辞',
  '擬音語',
  '擬態語',
  '慣用句',
  'ことわざ',
  '表現',
] as const;
export type Pos = (typeof POS)[number];

export const JLPT_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5', 'レベル外'] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export const WORD_ORIGINS = ['和語', '漢語', '外来語', '混種語'] as const;
export type WordOrigin = (typeof WORD_ORIGINS)[number];

export const STYLES = ['話し言葉', '書き言葉', '両方'] as const;
export type Style = (typeof STYLES)[number];

export const POLITENESS = ['スラング', 'くだけた', '普通', '丁寧'] as const;
export type Politeness = (typeof POLITENESS)[number];

/**
 * The four accent classes, named as a Japanese dictionary names them.
 *
 * They are not stored — `pitchAccent` is the number, and the class is derived
 * from it together with how many mora the reading has. 尾高 and 平板 both leave
 * the last mora high and are told apart only by what happens to a particle
 * after it, which is why the mora count is needed and why one number cannot
 * name its own class.
 */
export const ACCENT_PATTERNS = ['平板', '頭高', '中高', '尾高'] as const;
export type AccentPattern = (typeof ACCENT_PATTERNS)[number];

/** 1 (rare) – 5 (everyday). Rendered as ★×freq + ☆×(5−freq). */
export type Frequency = 1 | 2 | 3 | 4 | 5;

/** Part-of-speech-specific detail table, e.g. 名詞情報: 可算性 / する動詞化. */
export interface PosInfo {
  title: string;
  rows: { label: string; value: string }[];
}

/** One contextual meaning of the word. */
export interface Sense {
  /** Short heading for the sense, e.g. 「静寂（せいじゃく）」. */
  label: string;
  /** Japanese explanation of this sense. */
  description: string;
  /** Example sentence in Japanese. */
  example: string;
  /** Japanese paraphrase of the example, from the note's （意味：…） line. */
  exampleGloss: string;
  /** The example rendered in the learner's translation language. */
  translation: string;
  /** When this particular sense is used. */
  usage: string;
}

export interface Example {
  ja: string;
  translation: string;
}

export interface RelatedWord {
  headword: string;
  /** How this word differs from the entry's headword. */
  note: string;
}

/** The sentence the word was first met in. */
export interface EntryContext {
  original: string;
  ja: string;
  translation: string;
}

export interface UsageNotes {
  when: string;
  translation: string;
  caution: string;
}

export interface Entry {
  id: string;
  /**
   * Redundant with the document path (`users/{uid}/entries/{id}`) and kept
   * anyway: a published snapshot is a standalone document outside that path and
   * still has to name its owner, and rules on the public collections read this
   * field rather than walking up to a parent.
   */
  ownerUid: string;

  // --- the word itself
  headword: string;
  /** Kana reading. Empty when the headword is already kana-only. */
  reading: string;
  /**
   * Mora the pitch drops after; 0 is 平板, null when unknown.
   * Not present in the original notes — optional, fill in over time.
   */
  pitchAccent: number | null;

  // --- classification
  pos: Pos[];
  jlpt: JlptLevel;
  origin: WordOrigin | '';
  style: Style | '';
  politeness: Politeness | '';
  freq: Frequency;
  /** 登録形 — the dictionary form the entry is filed under. */
  citationForm: string;
  posInfo: PosInfo | null;

  // --- meaning
  /**
   * The one piece of content every entry must have. Deliberately not tied to a
   * language: write it in Japanese, in your own language, or both.
   */
  definition: string;
  /**
   * A remark on the definition — a translation, a caveat, a mnemonic. The
   * migrated notes put their Cantonese rendering here.
   */
  definitionSub: string;
  senses: Sense[];
  examples: Example[];
  related: RelatedWord[];

  // --- where it came from
  /** 出典 — 会議, 同僚, 小説「海辺のカフカ」, YouTube … */
  source: string;
  context: EntryContext;

  usage: UsageNotes;

  // --- organisation
  tags: Tag[];

  // --- publication
  /**
   * The `publicEntries` document this was last published to, or null.
   *
   * Stored on the private side so republishing and unpublishing need no lookup,
   * and so the list can show publication state without a second read. The
   * public id is an auto-id, never derived from this document's id or the uid —
   * deriving it would put the uid in a public URL and make it a stable public
   * identifier.
   */
  publishedId: string | null;
  /**
   * Increments on every republish. A published copy is an immutable snapshot,
   * so this is how the UI can tell that the live entry has moved on from what
   * other people can see.
   */
  publishedVersion: number;
  /** Set when this entry was copied from someone else's public one. */
  copiedFrom: Attribution | null;

  // --- bookkeeping
  /**
   * The day the word was encountered — user-editable, and what every dashboard
   * statistic and the contribution heatmap count. Kept separate from createdAt
   * so a word heard last week can be back-filled without distorting history.
   */
  learnedOn: IsoDate;
  /** Set once when the document is created; never written again. */
  createdAt: IsoDateTime;
  /** Rewritten on every save. */
  updatedAt: IsoDateTime;
}

/**
 * Fields the user may send when creating or editing an entry.
 *
 * Ownership, publication state and the timestamps are all set by the write
 * path, never by the form, so accepting them here would be an opening to
 * spoof them.
 */
export type EntryDraft = Omit<
  Entry,
  'id' | 'ownerUid' | 'publishedId' | 'publishedVersion' | 'copiedFrom' | 'createdAt' | 'updatedAt'
>;
