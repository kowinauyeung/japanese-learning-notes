import { describe, expect, it } from 'vitest';
import {
  debugTokensEndpoint,
  parseAppCheckDebugTokenArgs,
  readAppIdFromEnvFile,
  registrationFailureLines,
} from '../../admin/app-check-debug-token.shared';

describe('app-check-debug-token helpers', () => {
  it('parseAppCheckDebugTokenArgs rejects a truncated token, which would register a bypass that can never match and leave sign-in failing the same way', () => {
    const parsed = parseAppCheckDebugTokenArgs(['5e05991b-01cf-446b-aa33'], 'MacBookPro');
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.errors).toEqual([
      'not a debug token at argument 1 — expected the UUID `yarn dev` prints',
    ]);
  });

  it('parseAppCheckDebugTokenArgs rejects a version 1 UUID, which the App Check API refuses as not a UUID4 after the command has already reported success', () => {
    // Time-based rather than random: a valid RFC 4122 UUID that the SDK never
    // produces and `debugTokens.create` will not store.
    const parsed = parseAppCheckDebugTokenArgs(['5e05991b-01cf-11ee-aa33-c71a2359a27d'], 'host');
    expect(parsed.ok === false && parsed.errors).toEqual([
      'not a debug token at argument 1 — expected the UUID `yarn dev` prints',
    ]);
  });

  it('parseAppCheckDebugTokenArgs says the token is missing only when none was offered, not when one was rejected for its shape', () => {
    const empty = parseAppCheckDebugTokenArgs([], 'MacBookPro');
    expect(empty.ok === false && empty.errors).toEqual(['missing debug token']);
  });

  it('parseAppCheckDebugTokenArgs numbers the labels when one --name covers several tokens, so two browsers are not both listed under the same name', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      [
        '5e05991b-01cf-446b-aa33-c71a2359a27d',
        'd9b4c1b6-d47e-4254-84cc-da29d95954a0',
        '--name',
        'Chrome',
      ],
      'MacBookPro',
    );
    expect(parsed.ok === true && parsed.tokens).toEqual([
      { token: '5e05991b-01cf-446b-aa33-c71a2359a27d', displayName: 'Chrome (1)' },
      { token: 'd9b4c1b6-d47e-4254-84cc-da29d95954a0', displayName: 'Chrome (2)' },
    ]);
  });

  it('parseAppCheckDebugTokenArgs leaves a single token labelled exactly as asked, unnumbered', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5e05991b-01cf-446b-aa33-c71a2359a27d', '--name', 'Chrome'],
      'MacBookPro',
    );
    expect(parsed.ok === true && parsed.tokens).toEqual([
      { token: '5e05991b-01cf-446b-aa33-c71a2359a27d', displayName: 'Chrome' },
    ]);
  });

  it('parseAppCheckDebugTokenArgs reads the app id from .env.development unless prod is asked for, so a plain run cannot register a bypass on production', () => {
    const dev = parseAppCheckDebugTokenArgs(['5e05991b-01cf-446b-aa33-c71a2359a27d'], 'host');
    expect(dev.ok === true && [dev.projectId, dev.envFile]).toEqual([
      'goitei-dev',
      '.env.development',
    ]);

    const prod = parseAppCheckDebugTokenArgs(
      ['5e05991b-01cf-446b-aa33-c71a2359a27d', 'prod'],
      'host',
    );
    expect(prod.ok === true && [prod.projectId, prod.envFile]).toEqual([
      'goitei',
      '.env.production',
    ]);
  });

  it('parseAppCheckDebugTokenArgs refuses --project without --app-id, which would otherwise register this repository app id against somebody else project', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5e05991b-01cf-446b-aa33-c71a2359a27d', '--project', 'other-dev'],
      'host',
    );
    expect(parsed.ok === false && parsed.errors).toEqual(['--project requires --app-id']);
  });

  it('parseAppCheckDebugTokenArgs takes --app-id over the env file rather than reading one it was not asked to use', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5e05991b-01cf-446b-aa33-c71a2359a27d', '--project', 'other-dev', '--app-id', '1:2:web:3'],
      'host',
    );
    expect(parsed.ok === true && [parsed.projectId, parsed.appId, parsed.envFile]).toEqual([
      'other-dev',
      '1:2:web:3',
      null,
    ]);
  });

  it('parseAppCheckDebugTokenArgs rejects the same token twice, which the API would accept as two entries nobody can tell apart', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5E05991B-01CF-446B-AA33-C71A2359A27D', '5e05991b-01cf-446b-aa33-c71a2359a27d'],
      'host',
    );
    expect(parsed.ok === false && parsed.errors).toEqual(['duplicate debug token at argument 2']);
  });

  it('parseAppCheckDebugTokenArgs names the argument position rather than echoing a rejected token, which is a credential the success path already refuses to print', () => {
    const almost = '5e05991b-01cf-446b-aa33-c71a2359a27d,';
    const parsed = parseAppCheckDebugTokenArgs([almost], 'host');
    expect(parsed.ok).toBe(false);
    // The whole token bar the stray comma: rejecting it must not be the thing
    // that writes it into a shell scrollback or a CI log.
    expect(parsed.ok === false && parsed.errors.join(' ')).not.toContain(almost.slice(0, -1));
  });

  it('readAppIdFromEnvFile reads VITE_FIREBASE_APP_ID past a commented-out line rather than registering against the example value', () => {
    const contents = [
      '# VITE_FIREBASE_APP_ID=1:000:web:example',
      'VITE_FIREBASE_PROJECT_ID=goitei-dev',
      'VITE_FIREBASE_APP_ID="1:506149326465:web:abc"',
    ].join('\n');
    expect(readAppIdFromEnvFile(contents)).toBe('1:506149326465:web:abc');
  });

  it('readAppIdFromEnvFile returns null for an env file with the key unset, so the script asks for --app-id instead of posting an empty id', () => {
    expect(readAppIdFromEnvFile('VITE_FIREBASE_APP_ID=\n')).toBeNull();
  });

  it('debugTokensEndpoint leaves the colons in an app id unencoded, which is the form the App Check API accepts', () => {
    expect(debugTokensEndpoint('goitei-dev', '1:123:web:abc')).toBe(
      'https://firebaseappcheck.googleapis.com/v1/projects/goitei-dev/apps/1:123:web:abc/debugTokens',
    );
  });

  it('registrationFailureLines names the missing role on a 403, the one failure whose cause is not in the response body', () => {
    expect(registrationFailureLines(403, '{"error":{"message":"denied"}}', 'goitei-dev')).toEqual([
      'failed to register the debug token on goitei-dev (HTTP 403).',
      'Check that the credential holds roles/firebaseappcheck.admin on this project, and that `yarn auth:login` has been run.',
      '{"error":{"message":"denied"}}',
    ]);
  });
});
