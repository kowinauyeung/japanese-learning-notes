import { TAG_PATTERN } from '@/domain/common';
import type { Entry, EntryDraft } from '@/domain/entry';
import { isValidIsoDate } from './dates';
import { accentKana, accentPattern, moraCount } from './mora';

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
 */
export function draftError(draft: EntryDraft): string | null {
  if (!draft.headword.trim()) return '見出し語は必須です。';
  if (!draft.definition.trim()) return '意味・説明は必須です。';

  const bad = invalidTags(draft.tags);
  if (bad.length) return `タグに使えない文字があります: ${bad.join(', ')}`;

  // A cleared or impossible date must not reach Firestore. Read-side coercion
  // would silently rewrite it to today, which is indistinguishable from having
  // learned the word today and quietly wrong in every dashboard statistic.
  if (!isValidIsoDate(draft.learnedOn)) return '学習日を正しく入力してください。';

  if (draft.pitchAccent !== null) {
    const kana = accentKana(draft.headword, draft.reading);
    if (accentPattern(draft.pitchAccent, moraCount(kana)) === null) {
      return kana
        ? `アクセントが読み方の拍数に合いません（${kana} は${moraCount(kana)}拍）。`
        : 'アクセントを入れるには読み方（かな）が必要です。';
    }
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
 */
export function validTags(tags: string[]): string[] {
  const bad = new Set(invalidTags(tags));
  return tags.filter((tag) => !bad.has(tag));
}
