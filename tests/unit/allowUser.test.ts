import { describe, expect, it } from 'vitest';
import {
  describeCredentialSource,
  lookupErrorCode,
  lookupFailureLines,
  parseAllowUserArgs,
} from '../../admin/allow-user.shared';

describe('allow-user helpers', () => {
  it('parseAllowUserArgs accepts an explicit project override instead of falling back to goitei-dev', () => {
    expect(parseAllowUserArgs(['reader@example.com', '--project', 'reader-dev'])).toEqual({
      ok: true,
      email: 'reader@example.com',
      revoke: false,
      projectId: 'reader-dev',
    });
  });

  it('parseAllowUserArgs keeps the prod shorthand from falling back to goitei-dev', () => {
    expect(parseAllowUserArgs(['reader@example.com', 'prod', '--revoke'])).toEqual({
      ok: true,
      email: 'reader@example.com',
      revoke: true,
      projectId: 'goitei',
    });
  });

  it('parseAllowUserArgs rejects missing project ids instead of silently granting access on dev', () => {
    expect(parseAllowUserArgs(['reader@example.com', '--project'])).toEqual({
      ok: false,
      errors: ['--project requires a project id'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('parseAllowUserArgs rejects mixing the prod shorthand with an explicit project override', () => {
    expect(parseAllowUserArgs(['reader@example.com', 'prod', '--project', 'reader-prod'])).toEqual({
      ok: false,
      errors: ['choose either prod or --project <project-id>, not both'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('parseAllowUserArgs rejects the --prod typo so operators do not silently grant the dev project', () => {
    expect(parseAllowUserArgs(['reader@example.com', '--prod'])).toEqual({
      ok: false,
      errors: ['unknown argument: --prod'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('parseAllowUserArgs rejects repeated project overrides instead of silently taking the last one', () => {
    expect(
      parseAllowUserArgs([
        'reader@example.com',
        '--project',
        'reader-dev',
        '--project',
        'reader-prod',
      ]),
    ).toEqual({
      ok: false,
      errors: ['--project specified multiple times'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('parseAllowUserArgs rejects option tokens in the required email position', () => {
    expect(parseAllowUserArgs(['--revoke'])).toEqual({
      ok: false,
      errors: ['missing email'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
    expect(parseAllowUserArgs(['--project', 'reader-dev'])).toEqual({
      ok: false,
      errors: ['missing email', 'unknown argument: reader-dev'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
    expect(parseAllowUserArgs(['prod'])).toEqual({
      ok: false,
      errors: ['missing email'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('describeCredentialSource prefers a configured GOOGLE_APPLICATION_CREDENTIALS file', () => {
    expect(
      describeCredentialSource({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/service-account.json',
      }),
    ).toBe('GOOGLE_APPLICATION_CREDENTIALS=/tmp/service-account.json');
  });

  it('describeCredentialSource falls back to a configured CLOUDSDK_CONFIG directory', () => {
    expect(describeCredentialSource({ CLOUDSDK_CONFIG: '.gcloud' })).toBe(
      'applicationDefault() with CLOUDSDK_CONFIG=.gcloud',
    );
  });

  it('describeCredentialSource reports when no gcloud directory is configured', () => {
    expect(describeCredentialSource({})).toBe('applicationDefault() with CLOUDSDK_CONFIG unset');
  });

  it('lookupFailureLines keeps auth/user-not-found failures on the signed-in-once guidance', () => {
    expect(
      lookupFailureLines(
        'reader@example.com',
        'goitei',
        { code: 'auth/user-not-found' },
        { CLOUDSDK_CONFIG: '.gcloud' },
      ),
    ).toEqual(['reader@example.com has never signed in to goitei; ask them to try once first.']);
  });

  it('lookupFailureLines reports other lookup failures with credential diagnostics', () => {
    expect(
      lookupFailureLines(
        'reader@example.com',
        'goitei',
        { code: 'app/invalid-credential' },
        { CLOUDSDK_CONFIG: '.gcloud' },
      ),
    ).toEqual([
      'failed to look up reader@example.com in goitei (app/invalid-credential).',
      'credential configuration: applicationDefault() with CLOUDSDK_CONFIG=.gcloud',
    ]);
  });

  it('lookupErrorCode returns only string Firebase error codes', () => {
    expect(lookupErrorCode({ code: 'auth/user-not-found' })).toBe('auth/user-not-found');
    expect(lookupErrorCode({ code: 404 })).toBeUndefined();
    expect(lookupErrorCode(null)).toBeUndefined();
  });
});
