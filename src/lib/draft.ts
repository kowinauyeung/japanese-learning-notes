import { TAG_PATTERN } from '@/domain/common';
import type { Entry, EntryDraft } from '@/domain/entry';

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
