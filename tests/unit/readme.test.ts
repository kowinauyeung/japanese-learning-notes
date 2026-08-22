import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8');

describe('README rules rollout contract', () => {
  it('does not promise that every newer-client mismatch fails open', () => {
    expect(readme).not.toContain(
      'A client briefly older than its rules fails closed; the other way round fails open.',
    );
  });

  it('states that rules go first so a schema addition is allowlisted before any client sends it', () => {
    expect(readme).toContain(
      'so a schema addition is allowlisted before any client can send it',
    );
  });

  it('names the mismatch that stays open as looser deployed rules, not client age itself', () => {
    expect(readme).toContain('the direction that really stays open is a looser product limit');
  });
});
