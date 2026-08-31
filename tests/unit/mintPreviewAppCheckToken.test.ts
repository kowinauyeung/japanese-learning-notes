import { describe, expect, it } from 'vitest';
import {
  injectPreviewToken,
  parseMintPreviewTokenArgs,
} from '../../admin/mint-preview-app-check-token.shared';

describe('parseMintPreviewTokenArgs', () => {
  it('accepts the three required flags and defaults the ttl to 7 days', () => {
    expect(
      parseMintPreviewTokenArgs([
        '--app-id',
        '1:123:web:abc',
        '--project',
        'goitei-dev',
        '--dist',
        'dist/index.html',
      ]),
    ).toEqual({
      ok: true,
      appId: '1:123:web:abc',
      projectId: 'goitei-dev',
      distIndexPath: 'dist/index.html',
      ttlMillis: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it('takes an explicit --ttl-days over the default', () => {
    const result = parseMintPreviewTokenArgs([
      '--app-id',
      'id',
      '--project',
      'goitei-dev',
      '--dist',
      'dist/index.html',
      '--ttl-days',
      '1',
    ]);
    expect(result).toMatchObject({ ok: true, ttlMillis: 24 * 60 * 60 * 1000 });
  });

  it('rejects a --ttl-days outside the 30-minute-to-7-day range createToken enforces', () => {
    const result = parseMintPreviewTokenArgs([
      '--app-id',
      'id',
      '--project',
      'goitei-dev',
      '--dist',
      'dist/index.html',
      '--ttl-days',
      '8',
    ]);
    expect(result.ok).toBe(false);
  });

  it('reports every missing flag at once rather than stopping at the first', () => {
    expect(parseMintPreviewTokenArgs([])).toEqual({
      ok: false,
      errors: ['missing --app-id', 'missing --project', 'missing --dist'],
      usage:
        'usage: mint-preview-app-check-token.ts --app-id <id> --project <id> --dist <path/to/index.html> [--ttl-days <0.0208-7, default 7>]',
    });
  });

  it('rejects a repeated --project instead of silently deploying against whichever one came last', () => {
    const result = parseMintPreviewTokenArgs([
      '--app-id',
      'id',
      '--project',
      'goitei-dev',
      '--project',
      'goitei',
      '--dist',
      'dist/index.html',
    ]);
    expect(result).toEqual({
      ok: false,
      errors: ['--project specified multiple times'],
      usage:
        'usage: mint-preview-app-check-token.ts --app-id <id> --project <id> --dist <path/to/index.html> [--ttl-days <0.0208-7, default 7>]',
    });
  });
});

describe('injectPreviewToken', () => {
  const html =
    '<!doctype html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body></body>\n</html>\n';
  const minted = { token: 'header.payload.signature', expireTimeMillis: 1_700_000_000_000 };

  it('inserts the token as a script assignment right before </head>', () => {
    const out = injectPreviewToken(html, minted);
    // `client.ts` reads `window.__APP_CHECK_PREVIEW_TOKEN__` synchronously
    // before any module script runs; if this lands after `</head>`, or under
    // a different name or shape, the reader finds nothing and every preview
    // falls through to a reCAPTCHA path that cannot attest its own hostname —
    // the exact silent failure this mechanism exists to avoid.
    expect(out).toContain(
      '<script>window.__APP_CHECK_PREVIEW_TOKEN__=' +
        '{"token":"header.payload.signature","expireTimeMillis":1700000000000};</script></head>',
    );
    // A build step touching more than the one thing it was asked to inject
    // would corrupt the rest of the deployed page for every preview visitor,
    // not just fail to attest.
    expect(out.replace(/<script>window\.__APP_CHECK_PREVIEW_TOKEN__=.*?<\/script>/, '')).toBe(html);
  });

  it('throws instead of silently shipping a preview with no token, when </head> is missing', () => {
    expect(() => injectPreviewToken('<html><body></body></html>', minted)).toThrow(/<\/head>/);
  });

  it('escapes a `</script` inside the token so it cannot close the tag early', () => {
    const hostile = { token: '</script><script>alert(1)</script>', expireTimeMillis: 0 };
    const out = injectPreviewToken(html, hostile);
    // An unescaped `</script` here would close the tag early and run the
    // rest of the token as markup in every visitor's browser — this asserts
    // the injected page has no such break-out, not merely that escaping ran.
    expect(out).not.toContain('</script><script>alert(1)</script>');
    // Only `<` needs escaping: an HTML parser looks for a literal `</script`
    // to end the tag, and a lone `>` cannot start one.
    expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });
});
