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
        'usage: mint-preview-app-check-token.ts --app-id <id> --project <id> --dist <path/to/index.html> [--ttl-days <1-7>]',
    });
  });
});

describe('injectPreviewToken', () => {
  const html =
    '<!doctype html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body></body>\n</html>\n';
  const minted = { token: 'header.payload.signature', expireTimeMillis: 1_700_000_000_000 };

  it('inserts the token as a script assignment right before </head>', () => {
    const out = injectPreviewToken(html, minted);
    expect(out).toContain(
      '<script>window.__APP_CHECK_PREVIEW_TOKEN__=' +
        '{"token":"header.payload.signature","expireTimeMillis":1700000000000};</script></head>',
    );
    // Nothing else in the document moved.
    expect(out.replace(/<script>window\.__APP_CHECK_PREVIEW_TOKEN__=.*?<\/script>/, '')).toBe(html);
  });

  it('throws instead of silently shipping a preview with no token, when </head> is missing', () => {
    expect(() => injectPreviewToken('<html><body></body></html>', minted)).toThrow(/<\/head>/);
  });

  it('escapes a `</script` inside the token so it cannot close the tag early', () => {
    const hostile = { token: '</script><script>alert(1)</script>', expireTimeMillis: 0 };
    const out = injectPreviewToken(html, hostile);
    expect(out).not.toContain('</script><script>alert(1)</script>');
    // Only `<` needs escaping: an HTML parser looks for a literal `</script`
    // to end the tag, and a lone `>` cannot start one.
    expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });
});
