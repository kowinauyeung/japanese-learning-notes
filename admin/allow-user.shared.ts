type CredentialEnv = {
  CLOUDSDK_CONFIG?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  GOOGLE_CLOUD_QUOTA_PROJECT?: string;
};

export type ParsedAllowUserArgs =
  | {
      ok: true;
      email: string;
      revoke: boolean;
      projectId: string;
    }
  | {
      ok: false;
      errors: string[];
      usage: string;
    };

const USAGE = 'usage: allow-user.ts <email> [prod] [--project <project-id>] [--revoke]';

export function parseAllowUserArgs(args: string[]): ParsedAllowUserArgs {
  const [emailToken, ...rest] = args;
  const errors: string[] = [];
  const emailIsMissing = !emailToken || emailToken === 'prod' || emailToken.startsWith('--');
  const email = emailIsMissing ? null : emailToken;

  if (emailIsMissing) errors.push('missing email');

  let revoke = false;
  let prod = false;
  let projectId: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--revoke') {
      revoke = true;
      continue;
    }
    if (arg === 'prod') {
      prod = true;
      continue;
    }
    if (arg === '--project') {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--project requires a project id');
        continue;
      }
      if (projectId) {
        errors.push('--project specified multiple times');
        index += 1;
        continue;
      }
      projectId = value;
      index += 1;
      continue;
    }
    errors.push(`unknown argument: ${arg}`);
  }

  if (prod && projectId) errors.push('choose either prod or --project <project-id>, not both');

  if (errors.length > 0 || !email) {
    return { ok: false, errors, usage: USAGE };
  }

  return {
    ok: true,
    email,
    revoke,
    projectId: projectId ?? (prod ? 'goitei' : 'goitei-dev'),
  };
}

export function describeCredentialSource(env: CredentialEnv): string {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return `GOOGLE_APPLICATION_CREDENTIALS=${env.GOOGLE_APPLICATION_CREDENTIALS}`;
  }
  const quotaProject = env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim() || 'unset';
  if (env.CLOUDSDK_CONFIG) {
    return `applicationDefault() with CLOUDSDK_CONFIG=${env.CLOUDSDK_CONFIG}, GOOGLE_CLOUD_QUOTA_PROJECT=${quotaProject}`;
  }
  return `applicationDefault() with CLOUDSDK_CONFIG unset, GOOGLE_CLOUD_QUOTA_PROJECT=${quotaProject}`;
}

export function ensureAdcQuotaProject(env: CredentialEnv, projectId: string): void {
  if (!env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim()) {
    env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  }
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
    `credential configuration: ${describeCredentialSource(env)}`,
  ];
}
