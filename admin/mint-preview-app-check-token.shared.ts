export interface MintedPreviewToken {
  token: string;
  /** Local timestamp (epoch ms) after which the client must stop trusting it. */
  expireTimeMillis: number;
}

export type ParsedMintPreviewTokenArgs =
  | {
      ok: true;
      appId: string;
      projectId: string;
      distIndexPath: string;
      ttlMillis: number;
    }
  | {
      ok: false;
      errors: string[];
      usage: string;
    };

const USAGE =
  'usage: mint-preview-app-check-token.ts --app-id <id> --project <id> --dist <path/to/index.html> [--ttl-days <1-7>]';

/** Matches AppCheckTokenOptions.ttlMillis — "between 30 minutes and 7 days, inclusive". */
const MIN_TTL_DAYS = 1 / 48;
const MAX_TTL_DAYS = 7;
const DEFAULT_TTL_DAYS = 7;

export function parseMintPreviewTokenArgs(args: string[]): ParsedMintPreviewTokenArgs {
  const errors: string[] = [];
  let appId: string | null = null;
  let projectId: string | null = null;
  let distIndexPath: string | null = null;
  let ttlDays = DEFAULT_TTL_DAYS;

  const takeValue = (name: string, index: number): string | undefined => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      errors.push(`${name} requires a value`);
      return undefined;
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--app-id') {
      const value = takeValue('--app-id', index);
      if (value) appId = value;
      index += 1;
      continue;
    }
    if (arg === '--project') {
      const value = takeValue('--project', index);
      if (value) projectId = value;
      index += 1;
      continue;
    }
    if (arg === '--dist') {
      const value = takeValue('--dist', index);
      if (value) distIndexPath = value;
      index += 1;
      continue;
    }
    if (arg === '--ttl-days') {
      const value = takeValue('--ttl-days', index);
      if (value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < MIN_TTL_DAYS || parsed > MAX_TTL_DAYS) {
          errors.push(`--ttl-days must be between ${MIN_TTL_DAYS} and ${MAX_TTL_DAYS}`);
        } else {
          ttlDays = parsed;
        }
      }
      index += 1;
      continue;
    }
    errors.push(`unknown argument: ${arg}`);
  }

  if (!appId) errors.push('missing --app-id');
  if (!projectId) errors.push('missing --project');
  if (!distIndexPath) errors.push('missing --dist');

  if (errors.length > 0 || !appId || !projectId || !distIndexPath) {
    return { ok: false, errors, usage: USAGE };
  }

  return {
    ok: true,
    appId,
    projectId,
    distIndexPath,
    ttlMillis: Math.round(ttlDays * 24 * 60 * 60 * 1000),
  };
}

/**
 * A JSON value landing inside a `<script>` body is not HTML-safe as-is:
 * `JSON.stringify` does nothing about a `</script` substring, and a token
 * shaped to contain one would close the tag early and run whatever text
 * follows it as markup. Firebase App Check tokens are JWTs and never contain
 * one, but the escape costs one line and turns "cannot happen given today's
 * token format" into "cannot happen", which is the version worth shipping in
 * markup a real browser parses.
 */
function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Stamp a minted App Check token into a built `index.html`, synchronously
 * readable by `src/infra/firebase/client.ts` before any module script runs.
 *
 * A `<script>` in `<head>` rather than a fetched JSON file: the token has to
 * be available the instant `initializeAppCheck` runs, which is during the
 * synchronous evaluation of the first imported module — an async fetch would
 * mean either blocking first paint on it or racing it against Firestore calls
 * that assume App Check is already attached. `type="module"` scripts are
 * deferred until after the document parses, so a plain script earlier in
 * `<head>` is guaranteed to run first.
 *
 * Throws rather than silently returning the input unchanged: a template edit
 * that removes `</head>` should fail the deploy loudly, not ship a preview
 * that looks deployed and cannot sign in — which is exactly the failure mode
 * `src/infra/firebase/client.ts` already documents for the reCAPTCHA path.
 */
export function injectPreviewToken(html: string, minted: MintedPreviewToken): string {
  const marker = '</head>';
  const at = html.indexOf(marker);
  if (at === -1) {
    throw new Error(
      `${marker} not found in the built index.html — cannot inject the preview App Check token.`,
    );
  }
  const script = `<script>window.__APP_CHECK_PREVIEW_TOKEN__=${jsonForInlineScript(minted)};</script>`;
  return html.slice(0, at) + script + html.slice(at);
}
