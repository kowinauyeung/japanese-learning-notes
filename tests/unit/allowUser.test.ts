import { describe, expect, it } from 'vitest';
import {
  describeCredentialSource,
  lookupErrorCode,
  lookupFailureLines,
} from '../../admin/allow-user.shared';

describe('allow-user lookup failures', () => {
  it('describes GOOGLE_APPLICATION_CREDENTIALS when one is set', () => {
    expect(
      describeCredentialSource({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/service-account.json',
      }),
    ).toBe('GOOGLE_APPLICATION_CREDENTIALS=/tmp/service-account.json');
  });

  it('describes CLOUDSDK_CONFIG for application default credentials', () => {
    expect(describeCredentialSource({ CLOUDSDK_CONFIG: '.gcloud' })).toBe(
      'applicationDefault() with CLOUDSDK_CONFIG=.gcloud',
    );
  });

  it('says when application default credentials use the default config location', () => {
    expect(describeCredentialSource({})).toBe('applicationDefault() with CLOUDSDK_CONFIG unset');
  });

  it('keeps the signed-in-once wording only for auth/user-not-found', () => {
    expect(
      lookupFailureLines(
        'reader@example.com',
        'goitei',
        { code: 'auth/user-not-found' },
        { CLOUDSDK_CONFIG: '.gcloud' },
      ),
    ).toEqual(['reader@example.com has never signed in to goitei; ask them to try once first.']);
  });

  it('reports other lookup failures as themselves, with the credential source', () => {
    expect(
      lookupFailureLines(
        'reader@example.com',
        'goitei',
        { code: 'app/invalid-credential' },
        { CLOUDSDK_CONFIG: '.gcloud' },
      ),
    ).toEqual([
      'failed to look up reader@example.com in goitei (app/invalid-credential).',
      'credential source: applicationDefault() with CLOUDSDK_CONFIG=.gcloud',
    ]);
  });

  it('extracts string error codes only', () => {
    expect(lookupErrorCode({ code: 'auth/user-not-found' })).toBe('auth/user-not-found');
    expect(lookupErrorCode({ code: 404 })).toBeUndefined();
    expect(lookupErrorCode(null)).toBeUndefined();
  });
});
