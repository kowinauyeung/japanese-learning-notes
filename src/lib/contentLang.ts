import { useContext } from 'react';
import type { Entry } from '@/domain/entry';
import { UserSettingsContext } from '@/lib/userSettingsContext';

/**
 * The BCP 47 tag to mark a Japanese field in a note with.
 *
 * A constant rather than a literal at each site so that `grep JAPANESE` finds
 * every field this codebase claims is Japanese — which is the list a reader has
 * to be able to check, since being wrong about one of them is invisible until
 * somebody notices a character drawn in the wrong regional form.
 */
export const JAPANESE = 'ja';

/**
 * The tag to mark the fields `src/domain/entry.ts` describes as being in "the
 * learner's translation language" — `definitionSub`, and `translation` on a
 * sense, an example, a context or a usage note.
 *
 * `undefined` outside a signed-in session, and that is the honest answer rather
 * than a gap: a public entry's translation is in *its author's* language, which
 * the reader's profile does not know. Leaving the attribute off lets those
 * fields inherit the document's language, which is where they were before any
 * of this.
 *
 * Reads the context directly instead of through `useUserSettings`, which throws
 * outside the provider. The public pages render entries and have no provider,
 * and a font hint is not worth a crash.
 */
export function useTranslationLang(): string | undefined {
  return useContext(UserSettingsContext)?.profile.translationLanguage;
}

/**
 * A piece of a note, together with the language it is in — or no language at
 * all, where the schema does not say and this file will not guess.
 */
export interface ContentText {
  text: string;
  lang?: string | undefined;
}

/**
 * The one line a list shows under a headword, and what language it is in.
 *
 * Five screens render `senses[0].description || definition` and they must agree
 * about this, because the two halves are not the same language. `description`
 * is "Japanese explanation of this sense" in `src/domain/entry.ts` and is
 * marked so. `definition` is the field that schema explicitly declines to tie
 * to a language — "write it in Japanese, in your own language, or both" — and
 * it is also the only field an entry is required to have, which makes it the
 * likeliest of all of them to be in the reader's own language. So it is left
 * unmarked and inherits the document's, which is the only claim anything here
 * can actually support.
 *
 * `||` rather than `??`, matching the call sites this replaced: an empty
 * description falls through to the definition instead of rendering a blank
 * line.
 */
export function entrySummary(entry: Entry): ContentText {
  const description = entry.senses[0]?.description;
  return description ? { text: description, lang: JAPANESE } : { text: entry.definition };
}
