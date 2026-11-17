import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  appProxyMessage,
  isFreshTimestamp,
  verifyAdminLaunchHmac,
  verifyAppProxySignature,
  verifyWebhookHmac,
} from '../app/services/shopifySignatures.ts';

describe('app proxy signature', () => {
  // The two examples on https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
  // (shared secret "hush"), with and without a signed-in customer.
  const signedIn =
    'extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb';
  const guest =
    'extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb';

  it('accepts Shopify\'s documented examples', () => {
    expect(verifyAppProxySignature(new URLSearchParams(signedIn), 'hush')).toBe(true);
    expect(verifyAppProxySignature(new URLSearchParams(guest), 'hush')).toBe(true);
  });

  it('joins repeated parameters with commas and sorts by name', () => {
    expect(appProxyMessage(new URLSearchParams(signedIn))).toBe(
      'extra=1,2logged_in_customer_id=1path_prefix=/apps/awesome_reviewsshop=shop-name.myshopify.comtimestamp=1317327555',
    );
  });

  it('refuses a changed parameter, another secret, or no signature', () => {
    expect(verifyAppProxySignature(new URLSearchParams(signedIn.replace('logged_in_customer_id=1', 'logged_in_customer_id=2')), 'hush')).toBe(false);
    expect(verifyAppProxySignature(new URLSearchParams(signedIn), 'other')).toBe(false);
    expect(verifyAppProxySignature(new URLSearchParams(signedIn.replace(/&signature=[0-9a-f]+/, '')), 'hush')).toBe(false);
    expect(verifyAppProxySignature(new URLSearchParams(`${signedIn}x`), 'hush')).toBe(false);
    expect(verifyAppProxySignature(new URLSearchParams(signedIn), '')).toBe(false);
  });
});

describe('webhook HMAC', () => {
  // Expected value from: printf '%s' '{"id":1,"topic":"shop/redact"}' | openssl dgst -sha256 -hmac 'whsec-test' -binary | base64
  const body = '{"id":1,"topic":"shop/redact"}';
  const header = 'w5UeGwqSOBsfDHDxIWYnr7+nqIvfYBjAoDqDEE0JKto=';

  it('accepts the base64 HMAC of the raw body', () => {
    expect(verifyWebhookHmac(Buffer.from(body), header, 'whsec-test')).toBe(true);
    expect(verifyWebhookHmac(body, ` ${header} `, 'whsec-test')).toBe(true);
  });

  it('refuses a changed body, a wrong or missing header, or no secret', () => {
    expect(verifyWebhookHmac(`${body} `, header, 'whsec-test')).toBe(false);
    expect(verifyWebhookHmac(body, header.replace('w5', 'w6'), 'whsec-test')).toBe(false);
    expect(verifyWebhookHmac(body, null, 'whsec-test')).toBe(false);
    expect(verifyWebhookHmac(body, 'not base64 at all', 'whsec-test')).toBe(false);
    expect(verifyWebhookHmac(body, header, '')).toBe(false);
  });
});

describe('admin launch HMAC', () => {
  const secret = 'launch-secret';
  function signed(params: Record<string, string>): URLSearchParams {
    const search = new URLSearchParams(params);
    const message = [...search].map(([k, v]) => `${k}=${v}`).sort().join('&');
    search.set('hmac', createHmac('sha256', secret).update(message).digest('hex'));
    return search;
  }

  it('accepts the hmac over the other parameters joined with &', () => {
    expect(verifyAdminLaunchHmac(signed({ shop: 'demo.myshopify.com', timestamp: '1731840000', host: 'YWRtaW4' }), secret)).toBe(true);
  });

  it('refuses a changed shop or no hmac', () => {
    const params = signed({ shop: 'demo.myshopify.com', timestamp: '1731840000' });
    params.set('shop', 'other.myshopify.com');
    expect(verifyAdminLaunchHmac(params, secret)).toBe(false);
    expect(verifyAdminLaunchHmac(new URLSearchParams({ shop: 'demo.myshopify.com' }), secret)).toBe(false);
  });
});

describe('timestamp freshness', () => {
  const now = 1_763_380_000_000;
  it('allows ten minutes either way and nothing else', () => {
    expect(isFreshTimestamp(String(now / 1000 - 590), now)).toBe(true);
    expect(isFreshTimestamp(String(now / 1000 + 590), now)).toBe(true);
    expect(isFreshTimestamp(String(now / 1000 - 700), now)).toBe(false);
    expect(isFreshTimestamp('abc', now)).toBe(false);
    expect(isFreshTimestamp(null, now)).toBe(false);
  });
});
