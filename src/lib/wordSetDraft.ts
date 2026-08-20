import { WORD_SET_LIMITS } from '@/domain/limits';
import { describeSizeProblem } from './draft';

/**
 * Everything that must hold before a 単語集 may be written, or `null`.
 *
 * The entry side has had `draftError` from the start and this side had nothing
 * — the create box checked `name.trim()` and the edit modal checked the same
 * thing, and neither looked at length at all. `maxLength` was carrying the
 * whole rule on its own, which is the exact arrangement the comment on
 * `draftError` warns about: **a field that shows a limit in the form is not a
 * field that is refused.**
 *
 * What that leaves open is small and real. `maxLength` is a property of an
 * input element, so nothing reaches it on a path that does not go through one:
 * an IME commit can overshoot it, and any future caller that builds a set
 * without a form — an import, a copy of somebody else's published set — has no
 * input to attach it to. The security rules bound the name at 200 and the
 * description at 1,000, deliberately looser than the product rule, so the gap
 * between the two is reachable by exactly those paths.
 *
 * Returns the same sentinel wording `draftError` returns, so
 * `localizeFormError` translates both without knowing there are two callers.
 *
 * `entryIds` is checked in `WordSetDetail` rather than here, because that is
 * where the list is assembled and where the only path that can grow it lives.
 */
export function wordSetError(fields: { name: string; description: string }): string | null {
  const name = fields.name.trim();
  if (!name) return '単語集の名前は必須です。';

  if (name.length > WORD_SET_LIMITS.name) {
    return describeSizeProblem({
      path: 'name',
      unit: 'characters',
      actual: name.length,
      max: WORD_SET_LIMITS.name,
    });
  }

  const description = fields.description.trim();
  if (description.length > WORD_SET_LIMITS.description) {
    return describeSizeProblem({
      path: 'description',
      unit: 'characters',
      actual: description.length,
      max: WORD_SET_LIMITS.description,
    });
  }

  return null;
}
