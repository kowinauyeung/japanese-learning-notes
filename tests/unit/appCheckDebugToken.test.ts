import { describe, expect, it } from 'vitest';
import {
  debugTokensEndpoint,
  parseAppCheckDebugTokenArgs,
  readAppIdFromEnvFile,
  registrationFailureLines,
} from '../../admin/app-check-debug-token.shared';

describe('app-check-debug-token helpers', () => {
  it('rejects a truncated token, which would register a bypass that can never match and leave sign-in failing the same way', () => {
    const parsed = parseAppCheckDebugTokenArgs(['5e05991b-01cf-446b-aa33'], 'MacBookPro');
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.errors).toEqual([
      'not a debug token: 5e05991b-01cf-446b-aa33 — expected the UUID `yarn dev` prints',
    ]);
  });

  it('says the token is missing only when none was offered, not when one was rejected for its shape', () => {
    const empty = parseAppCheckDebugTokenArgs([], 'MacBookPro');
    expect(empty.ok === false && empty.errors).toEqual(['missing debug token']);
  });

  it('numbers the labels when one --name covers several tokens, so two browsers are not both listed under the same name', () => {
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

  it('leaves a single token labelled exactly as asked, unnumbered', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5e05991b-01cf-446b-aa33-c71a2359a27d', '--name', 'Chrome'],
      'MacBookPro',
    );
    expect(parsed.ok === true && parsed.tokens).toEqual([
      { token: '5e05991b-01cf-446b-aa33-c71a2359a27d', displayName: 'Chrome' },
    ]);
  });

  it('reads the app id from .env.development unless prod is asked for, so a plain run cannot register a bypass on production', () => {
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

  it('refuses --project without --app-id, which would otherwise register this repository app id against somebody else project', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5e05991b-01cf-446b-aa33-c71a2359a27d', '--project', 'other-dev'],
      'host',
    );
    expect(parsed.ok === false && parsed.errors).toEqual(['--project requires --app-id']);
  });

  it('takes --app-id over the env file rather than reading one it was not asked to use', () => {
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

  it('rejects the same token twice, which the API would accept as two entries nobody can tell apart', () => {
    const parsed = parseAppCheckDebugTokenArgs(
      ['5E05991B-01CF-446B-AA33-C71A2359A27D', '5e05991b-01cf-446b-aa33-c71a2359a27d'],
      'host',
    );
    expect(parsed.ok === false && parsed.errors).toEqual([
      'duplicate debug token: 5e05991b-01cf-446b-aa33-c71a2359a27d',
    ]);
  });

  it('reads VITE_FIREBASE_APP_ID past a commented-out line rather than registering against the example value', () => {
    const contents = [
      '# VITE_FIREBASE_APP_ID=1:000:web:example',
      'VITE_FIREBASE_PROJECT_ID=goitei-dev',
      'VITE_FIREBASE_APP_ID="1:506149326465:web:abc"',
    ].join('\n');
    expect(readAppIdFromEnvFile(contents)).toBe('1:506149326465:web:abc');
  });

  it('returns null for an env file with the key unset, so the script asks for --app-id instead of posting an empty id', () => {
    expect(readAppIdFromEnvFile('VITE_FIREBASE_APP_ID=\n')).toBeNull();
  });

  it('leaves the colons in an app id unencoded, which is the form the App Check API accepts', () => {
    expect(debugTokensEndpoint('goitei-dev', '1:123:web:abc')).toBe(
      'https://firebaseappcheck.googleapis.com/v1/projects/goitei-dev/apps/1:123:web:abc/debugTokens',
    );
  });

  it('names the missing role on a 403, the one failure whose cause is not in the response body', () => {
    expect(registrationFailureLines(403, '{"error":{"message":"denied"}}', 'goitei-dev')).toEqual([
      'failed to register the debug token on goitei-dev (HTTP 403).',
      'Check that the credential holds roles/firebaseappcheck.admin on this project, and that `yarn auth:login` has been run.',
      '{"error":{"message":"denied"}}',
    ]);
  });
});
