import { describe, expect, it } from 'vitest';
import { withDevTitle } from '../../manifest-plugin';

/**
 * iOS's "Add to Home Screen" reads `name`/`short_name` off the manifest, not
 * `<title>`, so a reader who installs the dev site has no way to tell it apart
 * from production on their home screen without this.
 */
describe('withDevTitle', () => {
  const manifest = { id: '/', name: '語彙庭', short_name: '語彙庭' };

  it('leaves the production manifest untouched', () => {
    expect(withDevTitle(manifest, 'goitei', 'production')).toEqual(manifest);
  });

  it('prefixes name and short_name for the dev project, whose build mode still reads production', () => {
    expect(withDevTitle(manifest, 'goitei-dev', 'production')).toEqual({
      id: '/',
      name: '[DEV]語彙庭',
      short_name: '[DEV]語彙庭',
    });
  });

  it('prefixes anything not built for release, whatever project it points at', () => {
    expect(withDevTitle(manifest, 'goitei', 'development')).toEqual({
      id: '/',
      name: '[DEV]語彙庭',
      short_name: '[DEV]語彙庭',
    });
  });
});
