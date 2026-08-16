/**
 * Where to land after signing in.
 *
 * `state.from` is set by `AppLayout` when it bounces an unauthenticated
 * visitor, but it arrives through history state, which any page can write — so
 * only a same-origin relative path is honoured. `//evil.com` and `https://…`
 * are both rejected, since the browser would read the first as a
 * protocol-relative URL and follow it off-site.
 *
 * Lives outside the route component so it can be tested for what it is: a
 * string-in, string-out check on untrusted input, with no React around it.
 */
export function safeRedirect(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return '/';
  return from.startsWith('/') && !from.startsWith('//') ? from : '/';
}
