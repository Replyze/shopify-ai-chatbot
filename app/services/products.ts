/**
 * Product facts for the chat: title, price, whether it can be bought now,
 * a short description and its link. Two sources share one interface: the
 * store's Storefront API (live) and the demo catalog (demo/data/store.json).
 *
 * "Available" is Shopify's availableForSale: at least one variant can be
 * bought right now. It is not a stock count, and the answer says when it was
 * checked, so nobody promises more than the store does.
 */
import type { StorefrontClient } from './storefront.ts';

export interface ProductSummary {
  title: string;
  /** "$48.00", or "$48.00 to $64.00" when variants cost different amounts. */
  price: string;
  availability: 'available' | 'sold out';
  url: string;
  /** Plain text, at most 280 characters. */
  description: string;
}

export interface ProductSource {
  readonly name: string;
  search(terms: string, limit: number): Promise<ProductSummary[]>;
}

export const MAX_RESULTS = 10;
const DESCRIPTION_LENGTH = 280;

/**
 * A shopper's words as plain search terms: letters, digits and spaces, at
 * most 8 words. Search syntax (quotes, colons, OR, wildcards) is dropped,
 * so chat text can't turn into a different Shopify query.
 */
export function searchTerms(input: string): string {
  const words = input
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 0 && !['and', 'or', 'not'].includes(w.toLowerCase()))
    .slice(0, 8);
  return words.join(' ').slice(0, 100);
}

export function formatPrice(amount: string | number, currencyCode: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currencyCode}`;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

export function priceRange(min: { amount: string; currencyCode: string }, max: { amount: string; currencyCode: string }): string {
  const low = formatPrice(min.amount, min.currencyCode);
  const high = formatPrice(max.amount, max.currencyCode);
  return low === high ? low : `${low} to ${high}`;
}

export function shortText(text: string, length = DESCRIPTION_LENGTH): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= length) return plain;
  const cut = plain.slice(0, length - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

interface StorefrontSearchResult {
  search: {
    nodes: Array<{
      __typename: string;
      title?: string;
      handle?: string;
      availableForSale?: boolean;
      onlineStoreUrl?: string | null;
      description?: string;
      priceRange?: {
        minVariantPrice: { amount: string; currencyCode: string };
        maxVariantPrice: { amount: string; currencyCode: string };
      };
    }>;
  };
  shop: { primaryDomain: { url: string } };
}

const SEARCH_QUERY = /* GraphQL */ `
  query ProductSearch($terms: String!, $first: Int!) {
    search(query: $terms, first: $first, types: [PRODUCT], unavailableProducts: LAST) {
      nodes {
        __typename
        ... on Product {
          title
          handle
          availableForSale
          onlineStoreUrl
          description
          priceRange {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
        }
      }
    }
    shop { primaryDomain { url } }
  }
`;

/** Live products from the store's Storefront API: the same search shoppers use on the store. */
export class StorefrontProductSource implements ProductSource {
  readonly name = 'shopify-storefront';
  private readonly client: StorefrontClient;

  constructor(client: StorefrontClient) {
    this.client = client;
  }

  async search(input: string, limit: number): Promise<ProductSummary[]> {
    const terms = searchTerms(input);
    if (!terms) return [];
    const first = Math.min(Math.max(1, Math.trunc(limit)), MAX_RESULTS);
    const data = await this.client.query<StorefrontSearchResult>(SEARCH_QUERY, { terms, first });
    const base = data.shop.primaryDomain.url.replace(/\/+$/, '');

    return data.search.nodes
      .filter((node) => node.__typename === 'Product' && node.title && node.handle && node.priceRange)
      .map((node) => ({
        title: node.title!,
        price: priceRange(node.priceRange!.minVariantPrice, node.priceRange!.maxVariantPrice),
        availability: node.availableForSale ? 'available' : 'sold out',
        // Null while a product isn't on the Online Store channel: link the product page on the store's domain.
        url: node.onlineStoreUrl || `${base}/products/${encodeURIComponent(node.handle!)}`,
        description: shortText(node.description ?? ''),
      }));
  }
}

export interface DemoProduct {
  handle: string;
  title: string;
  category: string;
  price: number;
  currency: string;
  available: boolean;
  description: string;
  keywords: string[];
}

/** Words that say nothing about which product is meant. */
const STOP_WORDS = new Set([
  'the', 'and', 'you', 'your', 'have', 'has', 'any', 'for', 'with', 'stock', 'available', 'price', 'cost', 'does', 'how', 'much',
  'what', 'are', 'can', 'get', 'buy', 'sell', 'still', 'there', 'this', 'that', 'want', 'need', 'looking', 'about', 'some', 'one',
]);

function stem(word: string): string {
  return word.length > 4 ? word.replace(/(es|s)$/, '') : word;
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);
}

/** The demo catalog: deterministic, so tests and screenshots always show the same answers. */
export class DemoProductSource implements ProductSource {
  readonly name = 'demo';
  private readonly products: DemoProduct[];
  private readonly baseUrl: string;

  constructor(products: DemoProduct[], baseUrl: string) {
    this.products = products;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** Products ranked by how many search words they match as whole words (title words count double). */
  match(input: string): DemoProduct[] {
    const words = searchTerms(input)
      .toLowerCase()
      .split(' ')
      .map(stem)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    if (words.length === 0) return [];
    const scored = this.products.map((product) => {
      const title = new Set(tokens(product.title));
      const other = new Set(tokens([product.category, ...product.keywords].join(' ')));
      let score = 0;
      for (const word of words) {
        if (title.has(word)) score += 2;
        else if (other.has(word)) score += 1;
      }
      return { product, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title))
      .map((s) => s.product);
  }

  summary(product: DemoProduct): ProductSummary {
    return {
      title: product.title,
      price: formatPrice(product.price, product.currency),
      availability: product.available ? 'available' : 'sold out',
      url: `${this.baseUrl}/products/${product.handle}`,
      description: shortText(product.description),
    };
  }

  async search(input: string, limit: number): Promise<ProductSummary[]> {
    const first = Math.min(Math.max(1, Math.trunc(limit)), MAX_RESULTS);
    return this.match(input).slice(0, first).map((p) => this.summary(p));
  }
}
