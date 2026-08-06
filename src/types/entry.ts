/**
 * Canonical database schema for the vocabulary notebook.
 *
 * Designed as a general system for a Japanese learner to *record*, *review* and
 * *practise* vocabulary — not as a mirror of the original markdown notes. Where
 * the two disagree the schema wins and the migration converts or drops.
 */

import type { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------- vocabulary

/**
 * Parts of speech a learner actually needs to distinguish.
 *
 * Conjugation classes are deliberately absent: サ変動詞 is a 名詞 that takes
 * する, which `posInfo` already records, so it would be a second, contradictory
 * source of truth. 形容詞/形容動詞 use the learner-facing い/な naming.
 */
export const POS = [
  '名詞', '代名詞', '動詞', 'い形容詞', 'な形容詞', '副詞',
  '連体詞', '接続詞', '感動詞', '助詞', '助動詞', '接頭辞', '接尾辞',
  '擬音語', '擬態語', '慣用句', 'ことわざ', '表現',
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

/** 1 (rare) – 5 (everyday). Rendered as ★×freq + ☆×(5−freq). */
export type Frequency = 1 | 2 | 3 | 4 | 5;

/**
 * Free-form, user-created tags, following the same rule as an Instagram
 * hashtag: any script's letters, digits and underscores, nothing else. Kanji
 * and kana are fine. Excluding whitespace and punctuation is what keeps a tag
 * usable in `?tag=…` — the value still gets percent-encoded, but it survives
 * the round trip and browsers display it decoded.
 */
export const TAG_PATTERN = /^[\p{L}\p{N}_]{1,32}$/u;
export type Tag = string;

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
  /** 出處 — 会議, 同僚, 小説「海辺のカフカ」, YouTube … */
  source: string;
  context: EntryContext;

  usage: UsageNotes;

  // --- organisation
  tags: Tag[];
  /** Slugs of the user-made word sets this entry belongs to. */
  wordSets: Tag[];

  // --- bookkeeping
  /**
   * The day the word was encountered — user-editable, and what every dashboard
   * statistic and the contribution heatmap count. Kept separate from createdAt
   * so a word heard last week can be back-filled without distorting history.
   */
  learnedOn: string; // YYYY-MM-DD
  /** Set once when the document is created; never written again. */
  createdAt: Timestamp;
  /** Rewritten on every save. */
  updatedAt: Timestamp;
}

/** Fields the user may send when creating an entry. */
export type EntryDraft = Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>;

// ------------------------------------------------------- review and practice

export type PracticeMode = 'flashcard' | 'dictation';

/** A completed practice run — the source for 履歴 and the dashboard panel. */
export interface PracticeSession {
  id: string;
  mode: PracticeMode;
  /** Human-readable description of the filters used, e.g. 「#work / 苦手のみ」. */
  filterLabel: string;
  total: number;
  correct: number;
  /** Entry ids answered wrong, for the session summary and quick re-practice. */
  missed: string[];
  startedAt: Timestamp;
  finishedAt: Timestamp;
}

/**
 * Per-entry practice state, keyed by entry id.
 *
 * Kept out of Entry so answering a card rewrites a small document instead of
 * the whole note, and so practice history survives edits to the note content.
 */
export interface EntryProgress {
  entryId: string;
  /** Outcome of the most recent attempt — what 苦手な語 is derived from. */
  status: 'correct' | 'wrong';
  lastMode: PracticeMode;
  lastAt: Timestamp;
  attempts: number;
  correctCount: number;
}

/** A user-organised list of entries, independent of tags. */
export interface WordSet {
  /** URL-safe slug, also the document id. */
  slug: Tag;
  name: string;
  createdAt: Timestamp;
}
