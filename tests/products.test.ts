import { describe, expect, it, vi } from 'vitest';
import { DemoProductSource, formatPrice, priceRange, searchTerms, shortText, StorefrontProductSource } from '../app/services/products.ts';
import { StorefrontClient, StorefrontError } from '../app/services/storefront.ts';
import { loadDemoStore } from '../demo/server.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const NODE = {
  __typename: 'Product',
  title: 'The Carbon',
  handle: 'the-carbon',
  availableForSale: true,
  onlineStoreUrl: 'https://shop.example.com/products/the-carbon',
  description: 'A board. '.repeat(60),
  priceRange: { minVariantPrice: { amount: '729.95', currencyCode: 'USD' }, maxVariantPrice: { amount: '729.95', currencyCode: 'USD' } },
};

function source(fetchImpl: typeof fetch, token: string | null = null) {
  return new StorefrontProductSource(new StorefrontClient({ storeDomain: 'demo.myshopify.com', apiVersion: '2026-10', token, fetch: fetchImpl }));
}

describe('searchTerms', () => {
  it('keeps words and drops Shopify search syntax', () => {
    expect(searchTerms('title:*shirt* OR "vendor:acme" AND (sale)')).toBe('title shirt vendor acme sale');
    expect(searchTerms("  women's   linen-shirt?! ")).toBe("women's linen-shirt");
    expect(searchTerms('one two three four five six seven eight nine ten')).toBe('one two three four five six seven eight');
    expect(searchTerms('???')).toBe('');
  });
});

describe('prices and text', () => {
  it('formats one price or a range', () => {
    expect(formatPrice('48', 'USD')).toBe('$48.00');
    expect(formatPrice('19.5', 'EUR')).toBe('€19.50');
    expect(priceRange({ amount: '500.0', currencyCode: 'USD' }, { amount: '700.0', currencyCode: 'USD' })).toBe('$500.00 to $700.00');
  });

  it('shortens long descriptions at a word', () => {
    const text = shortText('word '.repeat(100));
    expect(text.length).toBeLessThanOrEqual(280);
    expect(text.endsWith('word…')).toBe(true);
  });
});

describe('StorefrontProductSource', () => {
  it('asks the store\'s Storefront API with the search words and maps the products', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        data: {
          search: { nodes: [NODE, { ...NODE, title: 'Hidden board', handle: 'hidden', onlineStoreUrl: null, availableForSale: false }, { __typename: 'Article' }] },
          shop: { primaryDomain: { url: 'https://shop.example.com/' } },
        },
      }),
    );
    const results = await source(fetchMock as unknown as typeof fetch).search('carbon "board"', 3);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://demo.myshopify.com/api/2026-10/graphql.json');
    const body = JSON.parse(String(init!.body));
    expect(body.variables).toEqual({ terms: 'carbon board', first: 3 });
    expect((init!.headers as Record<string, string>)['X-Shopify-Storefront-Access-Token']).toBeUndefined();

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ title: 'The Carbon', price: '$729.95', availability: 'available', url: 'https://shop.example.com/products/the-carbon' });
    expect(results[0]!.description.length).toBeLessThanOrEqual(280);
    // No Online Store URL: the product page on the store's domain.
    expect(results[1]).toMatchObject({ availability: 'sold out', url: 'https://shop.example.com/products/hidden' });
  });

  it('sends a public Storefront token when one is set, and caps the result count', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { search: { nodes: [] }, shop: { primaryDomain: { url: 'https://x.com' } } } }));
    await source(fetchMock as unknown as typeof fetch, 'public-token').search('mug', 50);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['X-Shopify-Storefront-Access-Token']).toBe('public-token');
    expect(JSON.parse(String(init.body)).variables.first).toBe(10);
  });

  it('does not call Shopify for an empty search', async () => {
    const fetchMock = vi.fn();
    expect(await source(fetchMock as unknown as typeof fetch).search('?!', 5)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns Shopify failures into StorefrontError with a status', async () => {
    await expect(source((async () => new Response('', { status: 401 })) as unknown as typeof fetch).search('mug', 5)).rejects.toMatchObject({ status: 401 });
    await expect(source((async () => new Response('', { status: 430 })) as unknown as typeof fetch).search('mug', 5)).rejects.toThrow(/rate limiting/);
    await expect(
      source((async () => jsonResponse({ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] })) as unknown as typeof fetch).search('mug', 5),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      source((async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }) as unknown as typeof fetch).search('mug', 5),
    ).rejects.toBeInstanceOf(StorefrontError);
  });
});

describe('DemoProductSource', () => {
  const data = loadDemoStore();
  const demo = new DemoProductSource(data.products, 'http://localhost:4300/');

  it('finds products by title first, then by keywords', async () => {
    const results = await demo.search('wireless earbuds', 5);
    expect(results[0]).toEqual({
      title: 'Wireless Earbuds Pro',
      price: '$129.00',
      availability: 'available',
      url: 'http://localhost:4300/products/wireless-earbuds-pro',
      description: expect.stringContaining('Noise-cancelling'),
    });
  });

  it('reports sold-out products as sold out', async () => {
    expect((await demo.search('weekender bag', 1))[0]).toMatchObject({ title: 'Canvas Weekender Bag', availability: 'sold out' });
  });

  it('is deterministic and finds nothing for unrelated words', async () => {
    expect(await demo.search('linen', 5)).toEqual(await demo.search('linen', 5));
    expect(await demo.search('submarine', 5)).toEqual([]);
  });
});
