export interface DebugTokenRegistration {
  token: string;
  displayName: string;
}

export type ParsedAppCheckDebugTokenArgs =
  | {
      ok: true;
      projectId: string;
      /** Null when it has to be read from `envFile` instead. */
      appId: string | null;
      /** The Vite env file holding `VITE_FIREBASE_APP_ID`, or null when `--app-id` was given. */
      envFile: string | null;
      tokens: DebugTokenRegistration[];
    }
  | {
      ok: false;
      errors: string[];
      usage: string;
    };

const USAGE =
  'usage: app-check-debug-token.ts <uuid> [<uuid>...] [prod | --project <id>] ' +
  '[--app-id <id>] [--name <label>]';

/**
 * `src/infra/firebase/client.ts` sets `FIREBASE_APPCHECK_DEBUG_TOKEN = true`,
 * so every token this ever registers is a UUID the SDK generated and printed
 * to the console. Checking the shape catches the failure this command exists
 * to end: a half-selected paste registers a token that can never match, App
 * Check says nothing about it, and sign-in keeps failing with the same
 * generic message it failed with before.
 *
 * Version 4 specifically, variant nibble included, because that is what the
 * API accepts: `debugTokens.create` documents `token` as "must be a UUID4,
 * case insensitive" and refuses anything else. `crypto.randomUUID()`, which is
 * what the SDK calls, produces exactly that — so the narrower pattern rejects
 * nothing a browser can print, and turns a UUID from some other generator into
 * an error at the prompt rather than a 400 from Google.
 */
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAppCheckDebugTokenArgs(
  args: string[],
  fallbackName: string,
): ParsedAppCheckDebugTokenArgs {
  const errors: string[] = [];
  const tokens: string[] = [];
  let rejected = 0;
  let projectId: string | null = null;
  let appId: string | null = null;
  let displayName: string | null = null;
  let prod = false;

  const takeOnce = (name: string, index: number, current: string | null): string | null => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      errors.push(`${name} requires a value`);
      return current;
    }
    if (current !== null) {
      errors.push(`${name} specified multiple times`);
      return current;
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === 'prod') {
      prod = true;
      continue;
    }
    if (arg === '--project') {
      projectId = takeOnce('--project', index, projectId);
      index += 1;
      continue;
    }
    if (arg === '--app-id') {
      appId = takeOnce('--app-id', index, appId);
      index += 1;
      continue;
    }
    if (arg === '--name') {
      displayName = takeOnce('--name', index, displayName);
      index += 1;
      continue;
    }
    if (arg === undefined || arg.startsWith('--')) {
      errors.push(`unknown argument: ${arg}`);
      continue;
    }
    // Named by position, never by value. A debug token is a credential, and
    // the success path already refuses to print one; echoing a rejected one
    // undoes that for the case most likely to be a real token — a duplicate is
    // valid by definition, and a UUID that picked up trailing punctuation is
    // almost all of one. The position is what the operator needs anyway.
    if (!TOKEN_PATTERN.test(arg)) {
      errors.push(
        `not a debug token at argument ${index + 1} — expected the UUID \`yarn dev\` prints`,
      );
      rejected += 1;
      continue;
    }
    const normalized = arg.toLowerCase();
    if (tokens.includes(normalized)) {
      errors.push(`duplicate debug token at argument ${index + 1}`);
      continue;
    }
    tokens.push(normalized);
  }

  if (prod && projectId) errors.push('choose either prod or --project <project-id>, not both');
  // Only when nothing token-shaped was offered at all: telling an operator who
  // pasted half a UUID that they passed no token sends them looking for the
  // wrong mistake.
  if (tokens.length === 0 && rejected === 0) errors.push('missing debug token');

  // With `--project` there is no env file to read an app id out of: the two
  // Vite env files describe this repository's own projects and nothing else.
  if (projectId && !appId) errors.push('--project requires --app-id');

  if (errors.length > 0) return { ok: false, errors, usage: USAGE };

  return {
    ok: true,
    projectId: projectId ?? (prod ? 'goitei' : 'goitei-dev'),
    appId,
    envFile: appId ? null : prod ? '.env.production' : '.env.development',
    tokens: tokens.map((token, position) => ({
      token,
      // Numbered only when there is more than one, so the common single-token
      // case reads as the label the operator asked for.
      displayName:
        tokens.length === 1
          ? (displayName ?? fallbackName)
          : `${displayName ?? fallbackName} (${position + 1})`,
    })),
  };
}

/**
 * Pull `VITE_FIREBASE_APP_ID` out of a Vite env file.
 *
 * Deliberately not a general dotenv parser: this reads one known key out of a
 * file this repository writes, and a wrong answer is caught immediately by the
 * API rejecting the app id rather than by silently registering a token
 * somewhere else.
 */
export function readAppIdFromEnvFile(contents: string): string | null {
  for (const line of contents.split('\n')) {
    const match = /^\s*VITE_FIREBASE_APP_ID\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = (match[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (value) return value;
  }
  return null;
}

/**
 * The app id carries colons (`1:123:web:abc`). They are legal in a path
 * segment and the API accepts them as written; percent-encoding them is the
 * change to avoid, not the one to make.
 */
export function debugTokensEndpoint(projectId: string, appId: string): string {
  return `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}/debugTokens`;
}

export function registrationFailureLines(
  status: number,
  body: string,
  projectId: string,
): string[] {
  const lines = [`failed to register the debug token on ${projectId} (HTTP ${status}).`];
  if (status === 403 || status === 401) {
    lines.push(
      'Check that the credential holds roles/firebaseappcheck.admin on this project, ' +
        'and that `yarn auth:login` has been run.',
    );
  }
  if (status === 404) {
    lines.push('Check the app id: a web app id looks like `1:123456789:web:abcdef`.');
  }
  lines.push(body.trim());
  return lines;
}
