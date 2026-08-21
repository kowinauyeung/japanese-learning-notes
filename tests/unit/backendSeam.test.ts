import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The end-to-end build swaps the datasource by aliasing one specifier:
 *
 * ```ts
 * { find: /^@\/lib\/backend$/, replacement: src('lib/backend.e2e.ts') }
 * ```
 *
 * A regular expression anchored on `@/lib/backend` matches the absolute
 * specifier and nothing else, so `./lib/backend` from `src/main.tsx` — or
 * `./backend` from a sibling in `src/lib` — resolves straight past it to the
 * real module. Vite reports no error, the build succeeds, and the bundle
 * Playwright runs against quietly contains the Firebase SDK and the service
 * worker registration that `mode === 'e2e'` exists to keep out.
 *
 * Nothing about that is visible in a diff: a relative import next to other
 * relative imports is what the file already looks like. It happened once while
 * this test's own feature was being written.
 *
 * The layer is unit because the defect is a property of the source text. Seeing
 * it in a build would mean asserting on bundle contents, which is slower and
 * says less about why.
 */

const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Any import whose specifier ends at the backend module, however it is spelled. */
const BACKEND_IMPORT = /from\s+'([^']*\bbackend)'/g;

const offenders = sourceFiles(srcDir)
  .filter((path) => !path.endsWith('backend.e2e.ts'))
  .flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(BACKEND_IMPORT)]
      .map((match) => match[1])
      .filter((specifier) => specifier !== '@/lib/backend')
      .map((specifier) => `${path.slice(srcDir.length + 1)} imports '${specifier}'`);
  });

describe('the end-to-end backend seam', () => {
  // Passing by iterating over nothing is the exact shape of the bug below, so
  // the fixture is asserted before anything is concluded from it.
  it('can see the source tree it is scanning', () => {
    expect(sourceFiles(srcDir).length).toBeGreaterThan(20);
  });

  it('finds the real backend module, so a rename cannot make this pass by matching nothing', () => {
    const importers = sourceFiles(srcDir).filter((path) =>
      /from\s+'[^']*\bbackend'/.test(readFileSync(path, 'utf8')),
    );
    expect(importers.length).toBeGreaterThan(0);
  });

  it('names the backend as @/lib/backend everywhere, since a relative specifier resolves past the e2e alias', () => {
    expect(offenders).toEqual([]);
  });
});
