/**
 * The facts every public page repeats, in one place.
 *
 * **There is deliberately no email address.** Every contact goes through the
 * form, including security and privacy requests, and the reasoning is worth
 * keeping: an address printed on three public pages is a permanent, unrevocable
 * disclosure — once it is scraped, changing it means changing the policy and
 * notifying users — while a form can be closed and replaced at any time. APPI
 * asks for a channel through which a person can exercise their rights; it does
 * not ask for an email.
 *
 * That holds on one condition, and the condition is the whole of it: **the form
 * must take a reply address and must not require signing in.** A policy
 * promising disclosure, correction and deletion through a window that cannot
 * answer, or that demands a Google account from somebody objecting to how their
 * Google data is handled, is a legal promise that cannot be kept.
 *
 * **A third condition, of the same kind and easier to break by accident: the
 * form must not be set to collect respondents' Google addresses.** The privacy
 * policy states that signing in is not required and that no Google account
 * details are sent automatically. That is true of this form as configured, not
 * of Google Forms — turning on 回答者のメールアドレスを収集する falsifies it
 * from an admin screen, with no commit, no review and nothing in this
 * repository able to notice. Whoever changes the form's settings has to come
 * back here.
 *
 * The accepted cost is that there is no second channel. If the form breaks or
 * is deleted there is no way to reach the operator and no way for a user to
 * find that out. That is a decision, not an oversight.
 *
 * The link was checked before being written here — it resolves to a live form.
 */
export const site = {
  /** The name the service is operated under. */
  operator: 'Kowin',
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
