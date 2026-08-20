import type { IsoDate } from '@/domain/common';
import { TAG_PATTERN } from '@/domain/common';
import type { Entry, EntryDraft } from '@/domain/entry';
import { ENTRY_LIMITS } from '@/domain/limits';
import { isValidIsoDate } from './dates';
import { accentKana, accentProblem } from './mora';

/**
 * Pure draft helpers, kept clear of the repository so they can be used and
 * tested without initialising Firebase.
 */

/** Everything an Entry needs, with the blanks a new note starts from. */
export function emptyDraft(): EntryDraft {
  const today = new Date();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');
  return {
    headword: '',
    reading: '',
    pitchAccent: null,
    pos: [],
    jlpt: 'レベル外',
    origin: '',
    style: '',
    politeness: '',
    freq: 3,
    citationForm: '',
    posInfo: null,
    definition: '',
    definitionSub: '',
    senses: [],
    examples: [],
    related: [],
    source: '',
    context: { original: '', ja: '', translation: '' },
    usage: { when: '', translation: '', caution: '' },
    tags: [],
    learnedOn: `${today.getFullYear()}-${month}-${day}`,
  };
}

/**
 * Drops everything the form may not send. Destructure-and-discard rather than
 * listing the keepers, so a field added to `Entry` reaches the form by default
 * and only the deliberately-excluded ones need naming here.
 */
export function toDraft(entry: Entry): EntryDraft {
  const {
    id: _id,
    ownerUid: _ownerUid,
    publishedId: _publishedId,
    publishedVersion: _publishedVersion,
    copiedFrom: _copiedFrom,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...draft
  } = entry;
  return draft;
}

/** One value that is over its limit, named by where it sits in `EntryDraft`. */
export interface SizeProblem {
  /**
   * The key path exactly as the code and the JSON schema spell it —
   * `senses[2].description`, not a translated field label. The JSON tab is the
   * main consumer and its user is looking at those keys; the form shows one of
   * these beside a field they have just typed into, so the path is redundant
   * there rather than obscure.
   */
  path: string;
  unit: 'characters' | 'items';
  actual: number;
  max: number;
}

/**
 * Every limit in `ENTRY_LIMITS` checked at once, rather than the first failure.
 *
 * **This is where the nested fields are bounded, and it is the only place they
 * can be.** `firestore.rules` says so in its own comments: rules cannot iterate
 * a list, so no bound expressible there can see `senses[2].description`, and
 * `size()` on a map counts keys rather than the bytes in one. A megabyte inside
 * `context.original` is refused here or it is not refused.
 *
 * Lengths are `String.length`, which counts UTF-16 code units — an emoji outside
 * the BMP costs two. **Firestore's `size()` counts the same way**, which is a
 * measured fact and not an assumption: `tests/rules` walks the boundary with
 * ASCII, with かな and with a surrogate pair, and all three turn over at the
 * same number the client would compute. So the two layers cannot disagree about
 * what a character is, and a value the form accepts is never refused by the
 * rules for a reason nothing on screen can explain.
 *
 * That test is pinning somebody else's implementation detail, which is exactly
 * why it is worth having: nothing in this repository would notice if `size()`
 * changed to code points and every emoji-bearing note started saving to a
 * different limit than the form enforces.
 */
export function draftSizeProblems(draft: EntryDraft): SizeProblem[] {
  const problems: SizeProblem[] = [];
  const text = (path: string, value: string, max: number) => {
    if (value.length > max) problems.push({ path, unit: 'characters', actual: value.length, max });
  };
  const count = (path: string, items: readonly unknown[], max: number) => {
    if (items.length > max) problems.push({ path, unit: 'items', actual: items.length, max });
  };

  text('headword', draft.headword, ENTRY_LIMITS.headword);
  text('reading', draft.reading, ENTRY_LIMITS.reading);
  text('citationForm', draft.citationForm, ENTRY_LIMITS.citationForm);
  text('definition', draft.definition, ENTRY_LIMITS.definition);
  text('definitionSub', draft.definitionSub, ENTRY_LIMITS.definitionSub);
  text('source', draft.source, ENTRY_LIMITS.source);
  count('pos', draft.pos, ENTRY_LIMITS.pos);
  count('tags', draft.tags, ENTRY_LIMITS.tags);

  text('context.original', draft.context.original, ENTRY_LIMITS.context);
  text('context.ja', draft.context.ja, ENTRY_LIMITS.context);
  text('context.translation', draft.context.translation, ENTRY_LIMITS.context);
  text('usage.when', draft.usage.when, ENTRY_LIMITS.usage);
  text('usage.translation', draft.usage.translation, ENTRY_LIMITS.usage);
  text('usage.caution', draft.usage.caution, ENTRY_LIMITS.usage);

  count('senses', draft.senses, ENTRY_LIMITS.senses.count);
  draft.senses.forEach((sense, i) => {
    text(`senses[${i}].label`, sense.label, ENTRY_LIMITS.senses.label);
    text(`senses[${i}].description`, sense.description, ENTRY_LIMITS.senses.description);
    text(`senses[${i}].example`, sense.example, ENTRY_LIMITS.senses.text);
    text(`senses[${i}].exampleGloss`, sense.exampleGloss, ENTRY_LIMITS.senses.text);
    text(`senses[${i}].translation`, sense.translation, ENTRY_LIMITS.senses.text);
    text(`senses[${i}].usage`, sense.usage, ENTRY_LIMITS.senses.text);
  });

  count('examples', draft.examples, ENTRY_LIMITS.examples.count);
  draft.examples.forEach((example, i) => {
    text(`examples[${i}].ja`, example.ja, ENTRY_LIMITS.examples.text);
    text(`examples[${i}].translation`, example.translation, ENTRY_LIMITS.examples.text);
  });

  count('related', draft.related, ENTRY_LIMITS.related.count);
  draft.related.forEach((word, i) => {
    text(`related[${i}].headword`, word.headword, ENTRY_LIMITS.related.headword);
    text(`related[${i}].note`, word.note, ENTRY_LIMITS.related.note);
  });

  if (draft.posInfo) {
    text('posInfo.title', draft.posInfo.title, ENTRY_LIMITS.posInfo.title);
    count('posInfo.rows', draft.posInfo.rows, ENTRY_LIMITS.posInfo.rows);
    draft.posInfo.rows.forEach((row, i) => {
      text(`posInfo.rows[${i}].label`, row.label, ENTRY_LIMITS.posInfo.label);
      text(`posInfo.rows[${i}].value`, row.value, ENTRY_LIMITS.posInfo.value);
    });
  }

  // `pitchAccent` is deliberately absent: `accentProblem` already refuses any
  // value past the end of the reading, which is a tighter bound than a constant
  // could be and the only one that means anything for a mora index.
  return problems;
}

/**
 * The sentinel wording `localizeFormError` parses back into a message key.
 *
 * Same arrangement as the rest of this module: the pure layer speaks one fixed
 * Japanese string and the i18n layer translates it, so `draftError` stays
 * testable without a provider.
 */
export function describeSizeProblem(problem: SizeProblem): string {
  return problem.unit === 'characters'
    ? `${problem.path} が長すぎます: ${problem.actual}字（上限 ${problem.max}字）。`
    : `${problem.path} が多すぎます: ${problem.actual}件（上限 ${problem.max}件）。`;
}

/**
 * Everything that must hold before a draft may be written, or `null`.
 *
 * This lives here rather than inside the save handler so it can be tested at
 * all: `EntryFormModal` resolves its repository through a provider, which no
 * component test may reach.
 *
 * **A field that shows an error in the form is not a field that is refused.**
 * The accent had a red message under it and nothing stopping the save, so an
 * out-of-range value reached Firestore two ways, both silent: `2.5` was written
 * and then coerced to `null` on the next read, losing what was typed; `9` on a
 * three-mora word was written *and kept*, then drawn by nothing, because
 * `pitchShape` refuses to render what it cannot place. `learnedOn` had been
 * stopped here from the start, for the same class of reason.
 *
 * `today` is a parameter and not a `new Date()` because the learning date is
 * now bounded by it, and a validator that reads the clock is one that passes on
 * the day it was written and fails on the day the test is re-run.
 */
export function draftError(draft: EntryDraft, today: IsoDate): string | null {
  if (!draft.headword.trim()) return '見出し語は必須です。';
  if (!draft.definition.trim()) return '意味・説明は必須です。';

  // The first of possibly many, because a form shows one message at a time. The
  // JSON tab calls `draftSizeProblems` directly and lists all of them, which is
  // the difference that made this a separate function: a paste with six oversize
  // fields fixed one round trip at a time is a paste nobody finishes fixing.
  const oversize = draftSizeProblems(draft)[0];
  if (oversize) return describeSizeProblem(oversize);

  const bad = invalidTags(draft.tags);
  if (bad.length) return `タグに使えない文字があります: ${bad.join(', ')}`;

  // A cleared or impossible date must not reach Firestore. Read-side coercion
  // would silently rewrite it to today, which is indistinguishable from having
  // learned the word today and quietly wrong in every dashboard statistic.
  if (!isValidIsoDate(draft.learnedOn)) return '学習日を正しく入力してください。';

  // A word cannot have been learned tomorrow. Both bounds are string compares,
  // which is sound only because `isValidIsoDate` above has already established
  // that this is a real `YYYY-MM-DD` — zero-padded fixed-width dates sort
  // lexicographically in calendar order, and nothing else does.
  if (draft.learnedOn < ENTRY_LIMITS.learnedOnFrom || draft.learnedOn > today) {
    return `学習日は ${ENTRY_LIMITS.learnedOnFrom} から ${today} の間で入れてください。`;
  }

  if (draft.pitchAccent !== null) {
    // The same sentence the field is already showing. Two wordings for one
    // rejection is how the footer came to answer "たまご は3拍です" to a value
    // whose problem was that it was not a whole number.
    const problem = accentProblem(draft.pitchAccent, accentKana(draft.headword, draft.reading));
    if (problem) return problem;
  }

  return null;
}

/** Tags are typed as free text; split on spaces, commas and full-width commas. */
export function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,、，]+/)
        .map((tag) => tag.replace(/^#/, ''))
        .filter(Boolean),
    ),
  ];
}

export function invalidTags(tags: string[]): string[] {
  return tags.filter((tag) => !TAG_PATTERN.test(tag));
}

/**
 * The same rule from the other side, for the read path.
 *
 * `parseTags` splits and de-duplicates and has never checked the shape, so the
 * two paths disagreed: `a/b` and a 40-character tag were refused on save and
 * accepted on read. A stored document written before the rule existed, or by
 * hand, came back as a valid `Entry` carrying a tag the form would reject and
 * no filter chip could ever match — visible, unusable, and unexplained.
 *
 * Dropping is the right degradation here and is not the call made for the
 * accent's upper bound, because the rules differ in kind: `TAG_PATTERN` is
 * absolute, while an accent is only too large *relative to a sibling field the
 * user is still editing*.
 *
 * It tests `TAG_PATTERN` directly rather than routing through `invalidTags`.
 * The shared thing is the pattern, and an indirection that filters out what a
 * second pass just collected does not make the sharing any more real.
 */
export function validTags(tags: string[]): string[] {
  return tags.filter((tag) => TAG_PATTERN.test(tag));
}
