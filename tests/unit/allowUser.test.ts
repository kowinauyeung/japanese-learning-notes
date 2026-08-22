import { describe, expect, it } from 'vitest';
import {
  describeCredentialSource,
  lookupErrorCode,
  lookupFailureLines,
} from '../../admin/allow-user.shared';

describe('allow-user lookup failures', () => {
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
