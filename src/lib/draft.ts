import type { Entry, EntryDraft } from '@/types/entry';
import { TAG_PATTERN } from '@/types/entry';

/**
 * Pure draft helpers, kept clear of the Firestore module so they can be used
 * and tested without initialising Firebase.
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
    wordSets: [],
    learnedOn: `${today.getFullYear()}-${month}-${day}`,
  };
}

export function toDraft(entry: Entry): EntryDraft {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = entry;
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
