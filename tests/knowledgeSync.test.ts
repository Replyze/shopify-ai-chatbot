import { describe, expect, it, vi } from 'vitest';
import { applySync, collectStoreKnowledge, planSync, plainText, slugPart, SYNC_TAG, type KnowledgeDoc } from '../app/services/knowledgeSync.ts';
import { ReplyzeApi, ReplyzeApiError, type Article } from '../app/services/replyzeApi.ts';
import { StorefrontClient } from '../app/services/storefront.ts';

const policy = (handle: string, title: string, body: string) => ({ title, handle, url: `https://shop.example.com/policies/${handle}`, body });

function storefront(pages: Array<{ nodes: unknown[]; hasNextPage: boolean }>) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const page = pages[call++] ?? { nodes: [], hasNextPage: false };
    return new Response(
      JSON.stringify({
        data: {
          shop: {
            primaryDomain: { url: 'https://shop.example.com' },
            shippingPolicy: policy('shipping-policy', 'Shipping policy', '<p>Free over $75.</p>'),
            refundPolicy: policy('refund-policy', 'Refund policy', '<p>30 days.</p>'),
            privacyPolicy: null,
            termsOfService: policy('terms-of-service', 'Terms', '   '),
            subscriptionPolicy: null,
          },
          pages: { nodes: page.nodes, pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.hasNextPage ? `c${call}` : null } },
        },
      }),
      { status: 200 },
    );
  });
  return { client: new StorefrontClient({ storeDomain: 'demo.myshopify.com', apiVersion: '2026-10', fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

describe('collectStoreKnowledge', () => {
  it('reads policies with text and every page, following page cursors', async () => {
    const { client, fetchMock } = storefront([
      { nodes: [{ title: 'FAQ', handle: 'faq', body: '<h2>Sizes</h2><p>True to size.</p>', onlineStoreUrl: null }], hasNextPage: true },
      { nodes: [{ title: 'Contact', handle: 'contact', body: '<p>Write to us.</p>', onlineStoreUrl: 'https://shop.example.com/pages/contact' }, { title: 'Empty', handle: 'empty', body: '', onlineStoreUrl: null }], hasNextPage: false },
    ]);
    const docs = await collectStoreKnowledge(client, { policies: true, pages: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(docs.map((d) => d.slug)).toEqual(['shopify-shipping-policy', 'shopify-refund-policy', 'shopify-page-faq', 'shopify-page-contact']);
    expect(docs[2]!.content).toContain('Source: <a href="https://shop.example.com/pages/faq">');
    expect(docs[0]!.kind).toBe('policy');
  });

  it('can take only some pages, or none', async () => {
    const only = await collectStoreKnowledge(
      storefront([{ nodes: [{ title: 'FAQ', handle: 'faq', body: '<p>x</p>', onlineStoreUrl: null }, { title: 'About', handle: 'about', body: '<p>y</p>', onlineStoreUrl: null }], hasNextPage: false }]).client,
      { policies: false, pages: ['FAQ'] },
    );
    expect(only.map((d) => d.slug)).toEqual(['shopify-page-faq']);
    const { client, fetchMock } = storefront([{ nodes: [{ title: 'FAQ', handle: 'faq', body: '<p>x</p>', onlineStoreUrl: null }], hasNextPage: true }]);
    expect((await collectStoreKnowledge(client, { policies: true, pages: false })).map((d) => d.kind)).toEqual(['policy', 'policy']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('slugs and text', () => {
  it('makes Replyze-valid slugs', () => {
    expect(slugPart('Shipping & Returns!')).toBe('shipping-returns');
    expect(slugPart('Über uns')).toBe('uber-uns');
  });
  it('compares what a reader sees', () => {
    expect(plainText('<p>Free&nbsp;over <b>$75</b>.</p>\n')).toBe('Free over $75 .');
  });
});

const doc = (slug: string, title = 'T', content = '<p>Text</p>'): KnowledgeDoc => ({ slug, title, content, kind: 'policy' });
const article = (id: number, slug: string, extra: Partial<Article> = {}): Article => ({
  object: 'article', id, slug, title: 'T', status: 'published', tags: [SYNC_TAG, 'shopify'], ...extra,
});

describe('planSync', () => {
  it('creates new, updates changed, skips same, unpublishes gone, and never touches your own articles', async () => {
    const existing = [
      article(1, 'shopify-refund-policy'),
      article(2, 'shopify-shipping-policy'),
      article(3, 'shopify-page-old'),
      article(4, 'shopify-page-faq', { tags: ['faq'] }),
      article(5, 'shopify-page-gone-draft', { status: 'draft' }),
    ];
    const contents: Record<number, string> = { 1: '<div><p>Text</p></div>', 2: '<p>Old text</p>' };
    const getContent = vi.fn(async (a: Article) => contents[a.id] ?? '');
    const plan = await planSync(
      [doc('shopify-refund-policy'), doc('shopify-shipping-policy'), doc('shopify-page-faq'), doc('shopify-terms-of-service'), doc('shopify-terms-of-service')],
      existing,
      getContent,
      'published',
    );
    expect(plan.map((a) => `${a.type}:${'doc' in a ? a.doc.slug : a.article.slug}`)).toEqual([
      'unchanged:shopify-refund-policy',
      'update:shopify-shipping-policy',
      'conflict:shopify-page-faq',
      'create:shopify-terms-of-service',
      'unpublish:shopify-page-old',
    ]);
    // Your own article with the same slug isn't even read.
    expect(getContent).toHaveBeenCalledTimes(2);
  });

  it('publishes again a synced article that came back', async () => {
    const plan = await planSync([doc('shopify-page-faq')], [article(9, 'shopify-page-faq', { status: 'draft' })], async () => '<p>Text</p>', 'published');
    expect(plan[0]).toMatchObject({ type: 'update', publish: true });
  });
});

describe('applySync', () => {
  it('creates with an idempotency key and the sync tag, and only sends what changed', async () => {
    const calls: Array<{ method: string; url: string; body: unknown; headers: Record<string, string> }> = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init!.method!, url: String(url), body: init!.body ? JSON.parse(String(init!.body)) : null, headers: init!.headers as Record<string, string> });
      return new Response(JSON.stringify({ object: 'article', id: 1 }), { status: 200 });
    });
    const api = new ReplyzeApi({ apiUrl: 'https://client.replyze.chat/api/v1/', apiKey: 'rpz_live_test', fetch: fetchMock as unknown as typeof fetch });
    const result = await applySync(
      api,
      [
        { type: 'create', doc: doc('shopify-refund-policy', 'Refunds') },
        { type: 'update', doc: doc('shopify-faq', 'FAQ', '<p>New</p>'), article: article(7, 'shopify-faq'), publish: false },
        { type: 'unpublish', article: article(8, 'shopify-page-old') },
        { type: 'unchanged', doc: doc('a'), article: article(9, 'a') },
        { type: 'conflict', doc: doc('shopify-page-x'), article: article(10, 'shopify-page-x', { tags: [] }) },
      ],
      'draft',
    );
    expect(result).toEqual({ created: 1, updated: 1, unchanged: 1, unpublished: 1, conflicts: ['shopify-page-x'] });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://client.replyze.chat/api/v1/articles',
      'PATCH https://client.replyze.chat/api/v1/articles/7',
      'PATCH https://client.replyze.chat/api/v1/articles/8',
    ]);
    expect(calls[0]!.body).toEqual({ title: 'Refunds', slug: 'shopify-refund-policy', content: '<p>Text</p>', status: 'draft', tags: [SYNC_TAG, 'shopify'] });
    expect(calls[0]!.headers['Idempotency-Key']).toMatch(/^shopify-sync-[0-9a-f]{40}$/);
    expect(calls[0]!.headers.Authorization).toBe('Bearer rpz_live_test');
    expect(calls[1]!.body).toEqual({ title: 'FAQ', content: '<p>New</p>' });
    expect(calls[2]!.body).toEqual({ status: 'draft' });
  });
});

describe('ReplyzeApi', () => {
  it('reads every page of articles', async () => {
    const pages = [
      { object: 'list', data: [{ id: 1, slug: 'a' }], has_more: true, next_cursor: 'abc' },
      { object: 'list', data: [{ id: 2, slug: 'b' }], has_more: false, next_cursor: null },
    ];
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify(pages[urls.length - 1]), { status: 200 });
    });
    const api = new ReplyzeApi({ apiUrl: 'https://client.replyze.chat/api/v1', apiKey: 'rpz_live_x', fetch: fetchMock as unknown as typeof fetch });
    expect((await api.listArticles()).map((a) => a.id)).toEqual([1, 2]);
    expect(urls[1]).toBe('https://client.replyze.chat/api/v1/articles?limit=100&cursor=abc');
  });

  it('waits and retries when rate limited, then explains errors', async () => {
    const responses = [
      new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Slow down' } }), { status: 429, headers: { 'Retry-After': '2' } }),
      new Response(JSON.stringify({ error: { code: 'insufficient_scope', message: 'Needs knowledge:write' } }), { status: 403 }),
    ];
    const sleeps: number[] = [];
    const api = new ReplyzeApi({
      apiUrl: 'https://client.replyze.chat/api/v1',
      apiKey: 'rpz_live_x',
      fetch: (async () => responses.shift()!) as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    const error = await api.createArticle({ title: 'x' }, 'k').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplyzeApiError);
    expect(error).toMatchObject({ status: 403, code: 'insufficient_scope', message: 'The Replyze API key needs the knowledge:write scope.' });
    expect(sleeps).toEqual([2000]);
  });

  it('names a refused key', async () => {
    const api = new ReplyzeApi({
      apiUrl: 'https://client.replyze.chat/api/v1',
      apiKey: 'rpz_live_x',
      fetch: (async () => new Response(JSON.stringify({ error: { code: 'api_key_revoked', message: 'Revoked' } }), { status: 401 })) as unknown as typeof fetch,
    });
    await expect(api.me()).rejects.toThrow(/refused \(api_key_revoked\)/);
  });
});
