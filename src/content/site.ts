/**
 * The facts every public page repeats, in one place.
 *
 * **`contactEmail` and `feedbackFormUrl` are empty and the site is not ready to
 * be published until they are not.** They are left blank rather than filled with
 * a plausible-looking address on purpose: a wrong address in a privacy policy is
 * worse than a missing one, because it reads as a promise and delivers nothing —
 * and an invented one may belong to somebody real. Every page renders 準備中 in
 * their place, and `tests/unit/content.test.ts` states the rule so that shipping
 * without them is a decision rather than an oversight.
 */
export const site = {
  /** The name the service is operated under. */
  operator: 'Kowin',
  /** Where a user reaches a person. Private, so it is safe for sensitive reports. */
  contactEmail: '',
  /** Feedback goes to a form, not to Firestore — an unauthenticated write path is spam and quota surface. */
  feedbackFormUrl: '',
  repositoryUrl: 'https://github.com/kowinauyeung/japanese-learning-notes',
} as const;

/** `準備中` wherever a contact detail has not been filled in yet. */
export const orPending = (value: string): string => value || '準備中';
