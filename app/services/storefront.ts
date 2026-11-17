/**
 * A small client for Shopify's Storefront API (GraphQL). It reads only what
 * any shopper can see: products, prices, availability, pages and the store's
 * policies. Without a token it uses tokenless access, which needs no app,
 * no scope and no secret (https://shopify.dev/docs/api/storefront). A public
 * access token (from the Headless channel) can be added for higher limits.
 *
 * Nothing here can read customers or orders, and no Admin API token exists
 * anywhere in this project.
 */

export class StorefrontError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'StorefrontError';
    this.status = status;
  }
}

export interface StorefrontOptions {
  storeDomain: string;
  apiVersion: string;
  token?: string | null;
  /** Milliseconds before giving up. Replyze waits 6 s for a Live data lookup, so the default stays under it. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
}

export class StorefrontClient {
  readonly storeDomain: string;
  readonly apiVersion: string;
  private readonly token: string | null;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StorefrontOptions) {
    this.storeDomain = options.storeDomain;
    this.apiVersion = options.apiVersion;
    this.token = options.token ?? null;
    this.timeoutMs = options.timeoutMs ?? 4500;
    this.fetchImpl = options.fetch ?? fetch;
  }

  get endpoint(): string {
    return `https://${this.storeDomain}/api/${this.apiVersion}/graphql.json`;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.token) headers['X-Shopify-Storefront-Access-Token'] = this.token;

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new StorefrontError(timedOut ? 'Shopify did not answer in time.' : 'Could not reach Shopify.', 504);
    }

    if (!response.ok) {
      throw new StorefrontError(describeStatus(response.status, this.storeDomain), response.status);
    }

    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch {
      throw new StorefrontError('Shopify answered with something that is not JSON.', 502);
    }
    if (body.errors?.length) {
      const throttled = body.errors.some((e) => e.extensions?.code === 'THROTTLED');
      const message = body.errors.map((e) => e.message).filter(Boolean).join('; ') || 'GraphQL error';
      throw new StorefrontError(throttled ? 'Shopify is rate limiting these requests. Try again shortly.' : `Shopify: ${message}`, throttled ? 429 : 502);
    }
    if (!body.data) throw new StorefrontError('Shopify answered without data.', 502);
    return body.data;
  }
}

function describeStatus(status: number, domain: string): string {
  switch (status) {
    case 401:
    case 403:
      return `Shopify refused the request (${status}). The Storefront token may be wrong, or the store may not allow tokenless Storefront access.`;
    case 402:
      return `The store ${domain} is not available (402: frozen or unpaid).`;
    case 404:
      return `No Storefront API at ${domain} for this API version (404). Check SHOPIFY_STORE_DOMAIN and SHOPIFY_API_VERSION.`;
    case 423:
      return `The store ${domain} is locked (423).`;
    case 429:
    case 430:
      return 'Shopify is rate limiting these requests. Try again shortly.';
    default:
      return status >= 500 ? `Shopify had a problem (${status}). Try again shortly.` : `Shopify answered ${status}.`;
  }
}
