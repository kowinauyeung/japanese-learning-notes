/**
 * The shape every public document has.
 *
 * Prose is data rather than JSX so it can be edited — or handed to somebody to
 * polish — without touching a component, a route or a test. Nothing here knows
 * how it is rendered; `DocPage` decides that once for all four.
 *
 * `body` is an array of paragraphs rather than one string with newlines,
 * because a paragraph break is a structural decision and `whitespace-pre-line`
 * makes it an invisible one.
 */
export interface DocSection {
  heading: string;
  body: string[];
  /** Rendered as a list under `body`, when the section enumerates rather than explains. */
  list?: string[];
}

export interface Doc {
  title: string;
  /** One sentence under the title: what this document is for. */
  lead: string;
  /** ISO date. Shown as-is; a policy with no date cannot be compared to the one a user agreed to. */
  updated: string;
  sections: DocSection[];
}
