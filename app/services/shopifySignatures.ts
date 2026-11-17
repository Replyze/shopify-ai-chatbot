/**
 * Checks that a request really comes from Shopify. Every check is an
 * HMAC-SHA256 keyed with the app's client secret, compared in constant time:
 *
 * - webhooks: base64 of the raw body, in the X-Shopify-Hmac-SHA256 header
 *   (https://shopify.dev/docs/apps/build/webhooks/subscribe/https);
 * - app proxy requests: hex of the sorted query parameters joined with no
 *   separator, in the `signature` parameter
 *   (https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies);
 * - the app's home page opened from Shopify admin: hex of the sorted query
 *   parameters joined with "&", in the `hmac` parameter.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** A webhook's X-Shopify-Hmac-SHA256 header against its raw body. */
export function verifyWebhookHmac(rawBody: Buffer | string, header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.trim(), 'base64');
  } catch {
    return false;
  }
  return safeEqual(expected, given);
}

/** Query parameters grouped by name: a repeated parameter keeps every value, in order. */
function grouped(params: URLSearchParams, skip: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, value] of params) {
    if (key === skip) continue;
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }
  return map;
}

function hexEqual(expectedHex: string, givenHex: string | null): boolean {
  if (!givenHex || !/^[0-9a-f]+$/i.test(givenHex)) return false;
  return safeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(givenHex.toLowerCase(), 'hex'));
}

/** The message Shopify signs for an app proxy request: sorted "key=value" pairs, joined with nothing. */
export function appProxyMessage(params: URLSearchParams): string {
  return [...grouped(params, 'signature')]
    .map(([key, values]) => `${key}=${values.join(',')}`)
    .sort()
    .join('');
}

/** An app proxy request's `signature` parameter. */
export function verifyAppProxySignature(params: URLSearchParams, secret: string): boolean {
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(appProxyMessage(params)).digest('hex');
  return hexEqual(expected, params.get('signature'));
}

/** The app's home page opened from Shopify admin (`hmac` over the other parameters, joined with "&"). */
export function verifyAdminLaunchHmac(params: URLSearchParams, secret: string): boolean {
  if (!secret || !params.get('hmac')) return false;
  const message = [...grouped(params, 'hmac')]
    .map(([key, values]) => `${key}=${values.join(',')}`)
    .sort()
    .join('&');
  const expected = createHmac('sha256', secret).update(message).digest('hex');
  return hexEqual(expected, params.get('hmac'));
}

/**
 * Whether Shopify's `timestamp` parameter (seconds) is recent, so a signed
 * URL that leaked can't be replayed later. Ten minutes either way allows for
 * clock drift.
 */
export function isFreshTimestamp(timestamp: string | null, nowMs: number = Date.now(), windowSeconds = 600): boolean {
  if (!timestamp || !/^\d{9,11}$/.test(timestamp)) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= windowSeconds;
}
