import { describe, expect, it } from 'vitest';
import { providerPhotoUrl } from '@/lib/avatar';

/**
 * `photoUrl` reaches an `<img src>` unescaped, and it is not a value this app
 * wrote: it comes from whichever identity provider signed the user in, through
 * a token the account holder can influence. So it is checked like any other
 * untrusted string that ends up in the DOM.
 */
describe('providerPhotoUrl', () => {
  it('keeps the https photo the provider supplied', () => {
    expect(providerPhotoUrl('https://lh3.googleusercontent.com/a/abc123=s96-c')).toBe(
      'https://lh3.googleusercontent.com/a/abc123=s96-c',
    );
  });

  it('refuses the protocol-relative //evil.com, which the browser reads as a host', () => {
    expect(providerPhotoUrl('//evil.com/a.png')).toBeNull();
  });

  it('refuses javascript:, which an onerror handler would still be able to run', () => {
    expect(providerPhotoUrl('javascript:alert(1)')).toBeNull();
  });

  it('refuses a data: image, which is a payload rather than a hosted avatar', () => {
    expect(providerPhotoUrl('data:image/svg+xml,<svg onload="alert(1)"/>')).toBeNull();
  });

  it('refuses plain http, which the page is served over https and would block anyway', () => {
    expect(providerPhotoUrl('http://lh3.googleusercontent.com/a/abc123')).toBeNull();
  });

  it('treats the empty string as no photo, because that is what the adapter maps a missing one to', () => {
    expect(providerPhotoUrl('')).toBeNull();
    expect(providerPhotoUrl(null)).toBeNull();
    expect(providerPhotoUrl(undefined)).toBeNull();
  });
});
