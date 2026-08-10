import type { Entry } from '@/domain/entry';
import type { EntryProgress, PracticeMode, PracticeSessionDraft } from '@/domain/practice';
import type { WordSet } from '@/domain/wordSet';
import { addDays, dateKey, subtractMonths } from '@/lib/dates';

/**
 * Everything a practice session is decided by, before any of it is rendered.
 *
 * Kept apart from `lib/filters.ts` on purpose. Browse filters answer "which
 * words do I want to look at" and grew a search box, date range, 頻度 floor and
 * a sort order to do it; a session only needs "which words am I drilling", and
 * folding the two would put a sort order on something that is deliberately
 * shuffled and a 苦手のみ toggle on a list that has no notion of practice.
 */
export interface PracticeFilters {
  /** 単語集 ids. Membership lives on the set, so this resolves via `scopeFor`. */
  sets: string[];
  tags: string[];
  jlpt: string[];
  /** Single-valued, matching Browse: one 品詞 and one 語種 at a time. */
  pos: string;
  origin: string;
  /** Inclusive `learnedOn` bounds, `YYYY-MM-DD`. Empty means unbounded. */
  from: string;
  to: string;
  /** Only entries whose most recent attempt was wrong. */
  weakOnly: boolean;
}

export const EMPTY_PRACTICE_FILTERS: PracticeFilters = {
  sets: [],
  tags: [],
  jlpt: [],
  pos: '',
  origin: '',
  from: '',
  to: '',
  weakOnly: false,
};

export type QuickRangeKey = 'week' | 'month' | 'year';

export const QUICK_RANGES: { key: QuickRangeKey; label: string }[] = [
  { key: 'week', label: '1週間' },
  { key: 'month', label: '1ヶ月' },
  { key: 'year', label: '1年' },
];

/**
 * Where 「直近1ヶ月」 starts, as a `learnedOn` key.
 *
 * `now` is an argument for the reason everything else here takes one: a
 * function that reads the clock can only be tested on the day it was written.
 * A month is a calendar month rather than 30 days, so 「直近1ヶ月」 on the 15th
 * always means "since the 15th of last month" and does not drift.
 */
export function quickRangeStart(key: QuickRangeKey, now: Date): string {
  if (key === 'week') return dateKey(addDays(now, -7));
  return dateKey(subtractMonths(now, key === 'month' ? 1 : 12));
}

/**
 * Which quick range the current bounds *are*, so the chip can show as selected.
 *
 * A quick range sets only the start, so an explicit end means the learner has
 * since narrowed it by hand and no chip should claim to describe it.
 */
export function activeQuickRange(filters: PracticeFilters, now: Date): QuickRangeKey | null {
  if (filters.to || !filters.from) return null;
  return (
    QUICK_RANGES.find((range) => quickRangeStart(range.key, now) === filters.from)?.key ?? null
  );
}

/**
 * 苦手な語 is the *most recent* attempt, never an accumulated ratio: answering
 * a word correctly today has to clear it, or the list only ever grows and stops
 * describing what the learner still gets wrong.
 */
export function weakIdsOf(progress: readonly EntryProgress[]): Set<string> {
  return new Set(progress.filter((row) => row.status === 'wrong').map((row) => row.entryId));
}

/**
 * The two filters that are answered by an id lookup rather than by a field on
 * the entry, resolved once per render instead of per entry.
 *
 * A named object rather than two positional `Set`s: they are the same type,
 * so swapping them at a call site is invisible to the compiler and turns
 * 苦手のみ into 単語集 without a single error.
 */
export interface PracticeScope {
  /** Entries whose most recent attempt was wrong. */
  weak: ReadonlySet<string>;
  /** Members of the selected 単語集, or null when none is selected. */
  inSets: ReadonlySet<string> | null;
}

/**
 * Resolves the selected 単語集 into the entry ids they hold.
 *
 * Null rather than an empty set when nothing is selected, because those two
 * mean opposite things: "do not filter by set" and "a set with no words in it",
 * and collapsing them makes an empty set select everything.
 */
export function scopeFor(
  filters: PracticeFilters,
  sets: readonly WordSet[],
  weak: ReadonlySet<string>,
): PracticeScope {
  if (!filters.sets.length) return { weak, inSets: null };
  const selected = new Set(filters.sets);
  return {
    weak,
    inSets: new Set(sets.filter((set) => selected.has(set.id)).flatMap((set) => set.entryIds)),
  };
}

/**
 * Same combination rule as Browse: different filters AND, chips within one
 * filter OR. Two tags means "either tag", because a word normally has one.
 */
export function matchesPractice(
  entry: Entry,
  filters: PracticeFilters,
  scope: PracticeScope,
): boolean {
  if (scope.inSets && !scope.inSets.has(entry.id)) return false;
  if (filters.tags.length && !filters.tags.some((tag) => entry.tags.includes(tag))) return false;
  if (filters.jlpt.length && !filters.jlpt.includes(entry.jlpt)) return false;
  if (filters.pos && !entry.pos.includes(filters.pos as Entry['pos'][number])) return false;
  if (filters.origin && entry.origin !== filters.origin) return false;
  // `learnedOn` is a zero-padded ISO day, so a string comparison is a date
  // comparison — the same trick `lib/filters.ts` relies on.
  if (filters.from && entry.learnedOn < filters.from) return false;
  if (filters.to && entry.learnedOn > filters.to) return false;
  if (filters.weakOnly && !scope.weak.has(entry.id)) return false;
  return true;
}

/**
 * Fisher–Yates, with the source of randomness passed in.
 *
 * `Math.random()` inside would make the queue order untestable, and the order
 * is the entire point of a shuffle: an implementation that only ever moved the
 * first element would look fine in a browser and be a broken drill.
 */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * The human-readable label stored on the session, e.g. 「#仕事 / N1 / 苦手のみ」.
 *
 * Stored rather than recomputed because 履歴 has to keep describing a session
 * after the tag it was filtered by has been renamed or deleted.
 */
export function describeFilters(filters: PracticeFilters, sets: readonly WordSet[] = []): string {
  // Named, not by id: 履歴 is read by a person. A set deleted between the
  // session and the reading is named as missing rather than dropped, because
  // silently omitting a filter misdescribes what was drilled.
  const setNames = filters.sets.map(
    (id) => `単語集:${sets.find((set) => set.id === id)?.name ?? '不明'}`,
  );
  // The bounds are written out rather than as 「直近1ヶ月」: a quick range is
  // relative to the day it was picked, and a label read back a month later has
  // to still name the same days.
  const range = filters.from || filters.to ? [`${filters.from}〜${filters.to}`] : [];
  const parts = [
    ...setNames,
    ...filters.tags.map((tag) => `#${tag}`),
    ...filters.jlpt,
    ...(filters.pos ? [filters.pos] : []),
    ...(filters.origin ? [filters.origin] : []),
    ...range,
    ...(filters.weakOnly ? ['苦手のみ'] : []),
  ];
  return parts.length ? parts.join(' / ') : 'すべての語';
}

export interface Answer {
  entryId: string;
  correct: boolean;
}

/**
 * Folds a session's answers into the progress rows it touched, and returns
 * only those rows.
 *
 * Returning the full map instead would make every session overwrite every
 * entry, which is how a session finished on a phone silently reverts one
 * finished on a laptop a minute earlier.
 */
export function mergeProgress(
  existing: readonly EntryProgress[],
  answers: readonly Answer[],
  mode: PracticeMode,
  at: string,
): EntryProgress[] {
  const byId = new Map(existing.map((row) => [row.entryId, row]));
  const touched = new Map<string, EntryProgress>();

  for (const answer of answers) {
    const previous = touched.get(answer.entryId) ?? byId.get(answer.entryId);
    touched.set(answer.entryId, {
      entryId: answer.entryId,
      status: answer.correct ? 'correct' : 'wrong',
      lastMode: mode,
      lastAt: at,
      attempts: (previous?.attempts ?? 0) + 1,
      correctCount: (previous?.correctCount ?? 0) + (answer.correct ? 1 : 0),
    });
  }

  return [...touched.values()];
}

export function summariseSession(input: {
  mode: PracticeMode;
  filterLabel: string;
  answers: readonly Answer[];
  startedAt: string;
}): PracticeSessionDraft {
  return {
    mode: input.mode,
    filterLabel: input.filterLabel,
    total: input.answers.length,
    correct: input.answers.filter((answer) => answer.correct).length,
    missed: input.answers.filter((answer) => !answer.correct).map((answer) => answer.entryId),
    startedAt: input.startedAt,
  };
}
