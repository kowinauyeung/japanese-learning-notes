type CredentialEnv = {
  CLOUDSDK_CONFIG?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
};

export function describeCredentialSource(env: CredentialEnv): string {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return `GOOGLE_APPLICATION_CREDENTIALS=${env.GOOGLE_APPLICATION_CREDENTIALS}`;
  }
  if (env.CLOUDSDK_CONFIG) {
    return `applicationDefault() with CLOUDSDK_CONFIG=${env.CLOUDSDK_CONFIG}`;
  }
  return 'applicationDefault() with CLOUDSDK_CONFIG unset';
}

export function lookupErrorCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object') return undefined;
  const { code } = cause as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

export function lookupFailureLines(
  email: string,
  projectId: string,
  cause: unknown,
  env: CredentialEnv,
): string[] {
  if (lookupErrorCode(cause) === 'auth/user-not-found') {
    return [`${email} has never signed in to ${projectId}; ask them to try once first.`];
  }

  const code = lookupErrorCode(cause);
  return [
    `failed to look up ${email} in ${projectId}${code ? ` (${code})` : ''}.`,
    `credential source: ${describeCredentialSource(env)}`,
  ];
}
