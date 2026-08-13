import { describe, expect, it } from 'vitest';
import { buildLine, environmentOf } from '@/lib/build';

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
  it('reads as version, commit, environment', () => {
    expect(buildLine('goitei')).toMatch(/^v\d+\.\d+\.\d+ · \w+ · (Production|Development|Local)$/);
  });
});
