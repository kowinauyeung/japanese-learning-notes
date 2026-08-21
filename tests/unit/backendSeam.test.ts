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

/**
 * Every specifier in `source` that resolves to the backend module.
 *
 * Both spellings that reach a module have to be covered, and a first version of
 * this missed one. `import('…')` carries no `from`, so a detector written
 * around `from '…'` sees nothing — and a dynamic import is not hypothetical
 * here: every route in `src/router.tsx` is written as one, so it is the form a
 * lazily loaded consumer would most naturally reach for. Quote style is
 * normalised by Prettier and checked in CI, but costs nothing to accept.
 */
export const backendSpecifiers = (source: string): string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]*\bbackend)['"]/g)].map(
    (match) => match[1]!,
  );

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const offenders = sourceFiles(srcDir)
  .filter((path) => !path.endsWith('backend.e2e.ts'))
  .flatMap((path) =>
    backendSpecifiers(readFileSync(path, 'utf8'))
      .filter((specifier) => specifier !== '@/lib/backend')
      .map((specifier) => `${path.slice(srcDir.length + 1)} imports '${specifier}'`),
  );

/**
 * The detector, before anything is concluded from it. A scan that silently
 * matches nothing reports a clean tree and a broken seam identically, and that
 * is the failure this whole file is about — so the regular expression is held
 * to the same standard as the code it polices.
 */
describe('the detector sees every way a module is named', () => {
  it.each([
    ['a static import', "import { authPort } from './lib/backend';", './lib/backend'],
    ['a double-quoted import', 'import { authPort } from "./lib/backend";', './lib/backend'],
    // A sibling inside src/lib reaches it as './backend', which is the shortest
    // spelling and the one least likely to look wrong to a reader.
    ['a re-export', "export { authPort } from './backend';", './backend'],
    ['a dynamic import', "const m = await import('./lib/backend');", './lib/backend'],
    ['a double-quoted dynamic import', 'const m = await import("./lib/backend");', './lib/backend'],
    ['a lazy route-style import', "lazy: () => import('./backend')", './backend'],
  ])('finds the specifier in %s', (_form, source, expected) => {
    expect(backendSpecifiers(source)).toEqual([expected]);
  });

  it('reads the aliased spelling as itself, so the allowed form is not reported', () => {
    expect(backendSpecifiers("import { authPort } from '@/lib/backend';")).toEqual([
      '@/lib/backend',
    ]);
  });

  it.each([
    ['an unrelated module', "import { thing } from './backendish-helper';"],
    ['a word inside an identifier', 'const backendCount = 1;'],
  ])('does not invent a specifier from %s', (_form, source) => {
    expect(backendSpecifiers(source)).toEqual([]);
  });
});

describe('the end-to-end backend seam', () => {
  // Passing by iterating over nothing is the exact shape of the bug below.
  it('can see the source tree it is scanning', () => {
    expect(sourceFiles(srcDir).length).toBeGreaterThan(20);
  });

  it('finds the real backend module, so a rename cannot make this pass by matching nothing', () => {
    const importers = sourceFiles(srcDir).filter(
      (path) => backendSpecifiers(readFileSync(path, 'utf8')).length > 0,
    );
    expect(importers.length).toBeGreaterThan(0);
  });

  it('names the backend as @/lib/backend everywhere, since a relative specifier resolves past the e2e alias', () => {
    expect(offenders).toEqual([]);
  });
});
