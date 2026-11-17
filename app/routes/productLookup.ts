/**
 * GET /lookup/products?q=<words>&limit=<1-10>
 *
 * The endpoint a Replyze Live data source calls while the AI chats
 * (AI Agent → Live data in Replyze): base URL https://<this service>/lookup,
 * lookup path /products?q={product}, rows at `products`. Replyze makes a GET
 * with the header you set there (Authorization: Bearer <LOOKUP_API_KEY>) and
 * waits up to 6 seconds.
 *
 * Answers only public product facts: title, price, availability, a short
 * description and the link, as the store shows them right now.
 */
import { bearerToken, clientIp, RateLimiter, secretsEqual, sendError, sendJson, type Handler } from '../http.ts';
import { MAX_RESULTS, searchTerms, type ProductSource } from '../services/products.ts';
import { StorefrontError } from '../services/storefront.ts';

export interface ProductLookupDeps {
  source: ProductSource | null;
  apiKey: string | null;
  trustProxy?: boolean;
  limiter?: RateLimiter;
  now?: () => Date;
}

export function productLookup(deps: ProductLookupDeps): Handler {
  const limiter = deps.limiter ?? new RateLimiter(120, 60_000);
  const now = deps.now ?? (() => new Date());

  return async (req, res, url) => {
    if (req.method !== 'GET') return sendError(res, 405, 'method_not_allowed', 'Use GET.', { Allow: 'GET' });
    if (!deps.apiKey || !deps.source) {
      return sendError(res, 503, 'not_configured', 'The product lookup needs LOOKUP_API_KEY and SHOPIFY_STORE_DOMAIN (or DEMO_MODE=true).');
    }
    const token = bearerToken(req);
    if (!token || !secretsEqual(token, deps.apiKey)) {
      return sendError(res, 401, 'unauthorized', 'Send the lookup key as "Authorization: Bearer <key>".', { 'WWW-Authenticate': 'Bearer' });
    }
    if (!limiter.allow(clientIp(req, deps.trustProxy ?? false))) {
      return sendError(res, 429, 'rate_limited', 'Too many lookups. Try again in a minute.', { 'Retry-After': '60' });
    }

    const q = url.searchParams.get('q') ?? '';
    if (q.length > 200) return sendError(res, 400, 'query_too_long', 'q is at most 200 characters.');
    const terms = searchTerms(q);
    if (!terms) return sendError(res, 400, 'query_required', 'Send what to look for in q, like ?q=linen shirt.');

    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? 5 : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
      return sendError(res, 400, 'bad_limit', `limit is a whole number from 1 to ${MAX_RESULTS}.`);
    }

    try {
      const products = await deps.source.search(terms, limit);
      return sendJson(res, 200, {
        checked_at: now().toISOString(),
        source: deps.source.name,
        query: terms,
        products,
      });
    } catch (error) {
      if (error instanceof StorefrontError) {
        return sendError(res, error.status === 429 ? 429 : 502, 'shopify_unavailable', error.message);
      }
      throw error;
    }
  };
}
