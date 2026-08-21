import { describe, expect, it } from 'vitest';
import { withDevTitle } from '../../manifest-plugin';

/**
 * iOS's "Add to Home Screen" reads `name`/`short_name` off the manifest, not
 * `<title>`, so a reader who installs the dev site has no way to tell it apart
 * from production on their home screen without this.
 */
describe('withDevTitle', () => {
  const manifest = { id: '/', name: '語彙庭', short_name: '語彙庭' };

  it('does not mislabel the production home-screen icon as a dev build', () => {
    expect(withDevTitle(manifest, 'goitei', 'production')).toEqual(manifest);
  });

  it('flags the dev site’s home-screen icon, even though its build mode reads "production" like a real release', () => {
    expect(withDevTitle(manifest, 'goitei-dev', 'production')).toEqual({
      id: '/',
      name: '[DEV]語彙庭',
      short_name: '[DEV]語彙庭',
    });
  });

  it('flags a local/non-release build’s home-screen icon too, not only the deployed dev site', () => {
    expect(withDevTitle(manifest, 'goitei', 'development')).toEqual({
      id: '/',
      name: '[DEV]語彙庭',
      short_name: '[DEV]語彙庭',
    });
  });
});
