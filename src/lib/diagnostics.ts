import { appVersion, commitSha, environmentOf } from './build';

/**
 * What a bug report may carry, and what it may not.
 *
 * The exclusions are the point of this module. **No uid, no email, no token, no
 * vocabulary, no full URL.** A route *pattern* is included and the address is
 * not, because `/vocabulary/abc123` names a document and `/vocabulary/:id` names
 * a screen — and only one of those is needed to reproduce anything.
 *
 * Nothing here is sent anywhere. It is formatted for a person to read, copy and
 * paste into a form, which is why `errorId` is short enough to say aloud: it is
 * how a screenshot and a report get matched to each other.
 */
export interface Diagnostics {
  version: string;
  commit: string;
  environment: string;
  route: string;
  browser: string;
  screen: string;
  errorId: string;
  at: string;
}

/** Six characters of base 36. Enough to match a report to a screenshot, and meaningless alone. */
export function newErrorId(random = Math.random): string {
  return random().toString(36).slice(2, 8).padEnd(6, '0');
}

/**
 * The path with its identifiers removed.
 *
 * A vocabulary id is a Firestore document id and belongs to one person's
 * notebook; pasting it into a support form leaks which word was being read. The
 * screen is what a report needs.
 *
 * **By route, not by identifier shape.** The first version matched any segment
 * of twelve characters or more, which covers every id this app mints today —
 * all four sources are Firestore auto-ids, all twenty characters — and rests on
 * a vendor's id length being stable. A human-readable slug like
 * `/vocabulary/w-choukou` would walk straight through it, silently, in the one
 * direction where silence is the whole problem. The routes are enumerable, so
 * matching them costs nothing and stays true whatever an id looks like later.
 *
 * The guarantee this backs is stated without qualification in the privacy
 * policy and under the copy button, and a guarantee resting on a heuristic is
 * the kind that is true until it is not.
 */
export function routePattern(pathname: string): string {
  return (
    pathname
      .replace(/^\/vocabulary\/[^/]+/, '/vocabulary/:id')
      .replace(/^\/wordsets\/[^/]+/, '/wordsets/:id')
      // The two practice modes are enumerable and worth keeping.
      .replace(/^\/practice\/(?!flashcards$|dictation$)[^/]+/, '/practice/:mode') || '/'
  );
}

export function collectDiagnostics({
  projectId,
  pathname,
  errorId,
  now = new Date(),
  nav = typeof navigator === 'undefined' ? undefined : navigator,
  win = typeof window === 'undefined' ? undefined : window,
}: {
  projectId: string;
  pathname: string;
  errorId: string;
  now?: Date;
  nav?: { userAgent: string } | undefined;
  win?: { innerWidth: number; innerHeight: number } | undefined;
}): Diagnostics {
  return {
    version: appVersion,
    commit: commitSha,
    environment: environmentOf(projectId),
    route: routePattern(pathname),
    // The whole user-agent string, not a parsed name: parsing it is how a
    // report ends up saying "Safari" about something that was not Safari.
    browser: nav?.userAgent ?? 'unknown',
    screen: win ? `${win.innerWidth}x${win.innerHeight}` : 'unknown',
    errorId,
    at: now.toISOString(),
  };
}

/** Plain text, because it is pasted into a form field by hand. */
export function formatDiagnostics(d: Diagnostics): string {
  return [
    `version: v${d.version}`,
    `commit: ${d.commit}`,
    `environment: ${d.environment}`,
    `route: ${d.route}`,
    `browser: ${d.browser}`,
    `screen: ${d.screen}`,
    `error id: ${d.errorId}`,
    `at: ${d.at}`,
  ].join('\n');
}
