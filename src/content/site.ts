/**
 * The facts every public page repeats, in one place.
 *
 * Both contact details are real and were verified before being written here —
 * the form link resolves to a live form. They were deliberately blank until
 * then: a wrong address in a privacy policy is worse than a missing one,
 * because it reads as a promise, delivers nothing, and may belong to somebody
 * real. `orPending` and its test remain for the same reason, so emptying either
 * value fails the suite rather than quietly publishing 準備中.
 */
export const site = {
  /** The name the service is operated under. */
  operator: 'Kowin',
  /** Where a user reaches a person. Private, so it is safe for sensitive reports. */
  contactEmail: 'kowinauyeung@gmail.com',
  /** Feedback goes to a form, not to Firestore — an unauthenticated write path is spam and quota surface. */
  feedbackFormUrl: 'https://forms.gle/4TPufH5u3LNvWLLK9',
} as const;

/**
 * **There is deliberately no repository URL here.**
 *
 * The pages used to link it, and the source is public — but a public repository
 * discloses the schema, the security rules, the collection paths and the
 * project ids to anyone reading a support page, which is a starting point
 * handed to somebody probing the service rather than a courtesy to a user. A
 * reader who wants the source can find it; a reader who does not want it should
 * not be given a map of the backend on the error screen.
 *
 * If it is ever linked again, link it from a page a signed-in user reaches, not
 * from the four public documents and not from the crash screen.
 */

/** `準備中` wherever a contact detail has not been filled in yet. */
export const orPending = (value: string): string => value || '準備中';
