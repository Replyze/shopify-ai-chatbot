/**
 * GET /proxy/identity, reached through the Shopify app proxy as
 * https://<store>/apps/replyze-chat/identity.
 *
 * Shopify adds `logged_in_customer_id` (empty for guests) and signs every
 * parameter with the app's client secret, so the browser can't claim to be
 * someone else. For a signed-in customer this answers their Replyze user id
 * and its `user_hash`; the theme block passes both to Replyze.identify(), and
 * the chat becomes that customer's verified conversation. Guests get
 * { signed_in: false } and chat anonymously.
 *
 * Nothing about the customer is read or stored here: no name, no email, no
 * Admin API call. Only the id Shopify signed.
 */
import { clientIp, RateLimiter, sendError, sendJson, type Handler } from '../http.ts';
import { createUserHash, shopifyCustomerUserId } from '../services/replyzeIdentity.ts';
import { isFreshTimestamp, verifyAppProxySignature } from '../services/shopifySignatures.ts';

export interface AppProxyDeps {
  clientSecret: string | null;
  identitySecret: string | null;
  /** When set, requests for any other store are refused. */
  storeDomain: string | null;
  trustProxy?: boolean;
  limiter?: RateLimiter;
  now?: () => number;
}

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export function appProxyIdentity(deps: AppProxyDeps): Handler {
  const limiter = deps.limiter ?? new RateLimiter(60, 60_000);
  const now = deps.now ?? (() => Date.now());

  return (req, res, url) => {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'Use GET.', { Allow: 'GET' });
    if (!deps.clientSecret || !deps.identitySecret) {
      return sendError(res, 503, 'not_configured', 'Identity needs SHOPIFY_CLIENT_SECRET and REPLYZE_IDENTITY_SECRET.');
    }
    if (!limiter.allow(clientIp(req, deps.trustProxy ?? false))) {
      return sendError(res, 429, 'rate_limited', 'Too many requests.', { 'Retry-After': '60' });
    }

    const params = url.searchParams;
    if (!verifyAppProxySignature(params, deps.clientSecret)) {
      return sendError(res, 401, 'bad_signature', 'This request was not signed by Shopify.');
    }
    if (!isFreshTimestamp(params.get('timestamp'), now())) {
      return sendError(res, 401, 'stale_request', 'This signed request is too old.');
    }
    if (deps.storeDomain && params.get('shop') !== deps.storeDomain) {
      return sendError(res, 403, 'wrong_store', 'This service is set up for another store.');
    }

    const customerId = params.get('logged_in_customer_id') ?? '';
    if (!customerId) return sendJson(res, 200, { signed_in: false }, NO_STORE);
    if (!/^\d{1,20}$/.test(customerId)) return sendError(res, 400, 'bad_customer_id', 'Unexpected customer id.');

    const userId = shopifyCustomerUserId(customerId);
    return sendJson(res, 200, { signed_in: true, user_id: userId, user_hash: createUserHash(deps.identitySecret, userId) }, NO_STORE);
  };
}
