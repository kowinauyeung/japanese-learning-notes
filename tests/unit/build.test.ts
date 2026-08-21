import { describe, expect, it } from 'vitest';
import { buildLine, environmentOf, siteTitle } from '@/lib/build';
import { buildInfo } from '../../build-info';

/**
 * The line a bug report is read from. It is wrong in the way that matters if it
 * says "Production" on a page talking to the dev project — a report against the
 * wrong environment sends the reader to the wrong data.
 */
describe('environmentOf', () => {
  /**
   * The trap: every deployed build uses Vite's `production` mode, including the
   * one on goitei-dev. Reading the mode alone labels the dev site Production.
   */
  it('calls the dev project Development even though the build mode is production', () => {
    expect(environmentOf('goitei-dev', 'production')).toBe('Development');
    expect(environmentOf('goitei', 'production')).toBe('Production');
  });

  it('calls the reserved demo project Development, since e2e builds use it', () => {
    expect(environmentOf('demo-goitei', 'production')).toBe('Development');
  });

  it('calls anything not built for release Local, whatever it points at', () => {
    expect(environmentOf('goitei', 'development')).toBe('Local');
    expect(environmentOf('goitei', 'e2e')).toBe('Local');
  });
});

describe('buildLine', () => {
  it('reads as version, commit — no environment, which read as a status label on a screen a signed-in user sees daily', () => {
    expect(buildLine()).toMatch(/^v\d+\.\d+\.\d+ · \w+$/);
  });
});

/**
 * The substitute for spelling the environment out: a `[DEV]` prefix on the
 * name shown everywhere the app already displays its brand, rather than a
 * separate "Production"/"Development" line only the account page carried.
 */
describe('siteTitle', () => {
  it('leaves the production title alone', () => {
    expect(siteTitle('語彙庭', 'goitei', 'production')).toBe('語彙庭');
  });

  it('prefixes the dev project, even though its build mode reads production', () => {
    expect(siteTitle('語彙庭', 'goitei-dev', 'production')).toBe('[DEV]語彙庭');
  });

  it('prefixes a local dev server too, which is even less "production" than the deployed dev site', () => {
    expect(siteTitle('語彙庭', 'goitei', 'development')).toBe('[DEV]語彙庭');
  });
});

/**
 * The commit no longer renders in the footer — see the account page instead
 * — but it is still pinned for e2e, and build-info.ts is where that decision
 * and its history live.
 */
describe('the end-to-end build identity', () => {
  it('pins the commit, so a screenshot baseline can contain it', () => {
    expect(buildInfo('e2e').__COMMIT_SHA__).toBe(JSON.stringify('e2e0000'));
  });

  it('does not pin it for any other build', () => {
    expect(buildInfo('production').__COMMIT_SHA__).not.toBe(JSON.stringify('e2e0000'));
  });
});
