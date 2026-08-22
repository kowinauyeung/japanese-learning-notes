import { describe, expect, it } from 'vitest';
import {
  describeCredentialSource,
  lookupErrorCode,
  lookupFailureLines,
  parseAllowUserArgs,
} from '../../admin/allow-user.shared';

describe('allow-user lookup failures', () => {
  it('accepts an explicit project override for fresh Firebase projects', () => {
    expect(parseAllowUserArgs(['reader@example.com', '--project', 'reader-dev'])).toEqual({
      ok: true,
      email: 'reader@example.com',
      revoke: false,
      projectId: 'reader-dev',
    });
  });

  it('keeps the prod shorthand for the repository production project', () => {
    expect(parseAllowUserArgs(['reader@example.com', 'prod', '--revoke'])).toEqual({
      ok: true,
      email: 'reader@example.com',
      revoke: true,
      projectId: 'goitei',
    });
  });

  it('rejects missing project ids instead of silently granting access on dev', () => {
    expect(parseAllowUserArgs(['reader@example.com', '--project'])).toEqual({
      ok: false,
      errors: ['--project requires a project id'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('rejects mixing the prod shorthand with an explicit project override', () => {
    expect(parseAllowUserArgs(['reader@example.com', 'prod', '--project', 'reader-prod'])).toEqual({
      ok: false,
      errors: ['choose either prod or --project <project-id>, not both'],
      usage: 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]',
    });
  });

  it('prevents diagnostics from hiding a configured GOOGLE_APPLICATION_CREDENTIALS file', () => {
    expect(
      describeCredentialSource({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/service-account.json',
      }),
    ).toBe('GOOGLE_APPLICATION_CREDENTIALS=/tmp/service-account.json');
  });

  it('prevents diagnostics from hiding a configured CLOUDSDK_CONFIG directory', () => {
    expect(describeCredentialSource({ CLOUDSDK_CONFIG: '.gcloud' })).toBe(
      'applicationDefault() with CLOUDSDK_CONFIG=.gcloud',
    );
  });

  it('prevents diagnostics from inventing a configured gcloud directory when none is set', () => {
    expect(describeCredentialSource({})).toBe('applicationDefault() with CLOUDSDK_CONFIG unset');
  });

  it('prevents non-user-not-found failures from being misreported as never-signed-in accounts', () => {
    expect(
      lookupFailureLines(
        'reader@example.com',
        'goitei',
        { code: 'auth/user-not-found' },
        { CLOUDSDK_CONFIG: '.gcloud' },
      ),
    ).toEqual(['reader@example.com has never signed in to goitei; ask them to try once first.']);
  });

  it('prevents other lookup failures from hiding their credential configuration', () => {
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

  it('prevents non-string thrown codes from being treated as valid Firebase error codes', () => {
    expect(lookupErrorCode({ code: 'auth/user-not-found' })).toBe('auth/user-not-found');
    expect(lookupErrorCode({ code: 404 })).toBeUndefined();
    expect(lookupErrorCode(null)).toBeUndefined();
  });
});
