/**
 * Keeps the store's policies and pages in the Replyze knowledge base, so the
 * AI answers "how long does delivery take?" or "can I return this?" from the
 * store's own words.
 *
 * Read: the Storefront API (shop policies and Online Store pages, which any
 * shopper can see). Written: Replyze articles through the REST API, one per
 * policy or page, with slug `shopify-<handle>` and the tag `shopify-sync`.
 *
 * Rules:
 * - Only articles this sync made (tag + slug) are ever changed. An article
 *   of yours with the same slug is left alone and reported.
 * - An article changes only when its title or text changed (compared as
 *   plain text, so formatting Replyze applies on save doesn't count).
 * - A policy or page that is gone from the store is not deleted: its article
 *   goes back to draft, so the AI stops using it and you can review it.
 * - Edit the source in Shopify. An edit made in Replyze to a synced article
 *   is replaced on the next sync.
 */
import { createHash } from 'node:crypto';
import type { Article, ArticleInput, ReplyzeApi } from './replyzeApi.ts';
import type { StorefrontClient } from './storefront.ts';

export const SYNC_TAG = 'shopify-sync';
const SLUG_PREFIX = 'shopify-';
/** Pages Shopify makes by itself ("Your privacy choices"); synced only when named in --pages. */
const SYSTEM_PAGES = new Set(['data-sharing-opt-out']);

export interface KnowledgeDoc {
  slug: string;
  title: string;
  /** HTML, with a "Source:" line linking the page on the store. */
  content: string;
  kind: 'policy' | 'page';
}

export interface CollectOptions {
  policies: boolean;
  /** true: every published page; a list: only these page handles; false: none. */
  pages: boolean | string[];
}

interface Policy {
  title: string;
  handle: string;
  url: string;
  body: string;
}

interface StoreKnowledgeResult {
  shop: {
    primaryDomain: { url: string };
    shippingPolicy: Policy | null;
    refundPolicy: Policy | null;
    privacyPolicy: Policy | null;
    termsOfService: Policy | null;
    subscriptionPolicy: Policy | null;
  };
  pages: {
    nodes: Array<{ title: string; handle: string; body: string; onlineStoreUrl: string | null }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

const STORE_QUERY = /* GraphQL */ `
  query StoreKnowledge($after: String) {
    shop {
      primaryDomain { url }
      shippingPolicy { title handle url body }
      refundPolicy { title handle url body }
      privacyPolicy { title handle url body }
      termsOfService { title handle url body }
      subscriptionPolicy { title handle url body }
    }
    pages(first: 50, after: $after) {
      nodes { title handle body onlineStoreUrl }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/** "Shipping & Returns!" -> "shipping-returns" (Replyze slugs are lowercase words joined by "-"). */
export function slugPart(handle: string): string {
  return handle
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function withSource(body: string, url: string): string {
  const safe = escapeHtml(url);
  return `${body.trim()}\n<p>Source: <a href="${safe}">${safe}</a></p>`;
}

export async function collectStoreKnowledge(client: StorefrontClient, options: CollectOptions): Promise<KnowledgeDoc[]> {
  const docs: KnowledgeDoc[] = [];
  let after: string | null = null;
  let first = true;
  const wanted = Array.isArray(options.pages) ? new Set(options.pages.map((h) => h.toLowerCase())) : null;

  // The first request brings the policies and the first 50 pages; more requests only when pages are wanted.
  for (let round = 0; round < 20; round++) {
    const data: StoreKnowledgeResult = await client.query<StoreKnowledgeResult>(STORE_QUERY, { after });
    if (first && options.policies) {
      const policies = [data.shop.shippingPolicy, data.shop.refundPolicy, data.shop.privacyPolicy, data.shop.termsOfService, data.shop.subscriptionPolicy];
      for (const policy of policies) {
        if (!policy || !policy.body?.trim()) continue;
        docs.push({ slug: `${SLUG_PREFIX}${slugPart(policy.handle)}`, title: policy.title, content: withSource(policy.body, policy.url), kind: 'policy' });
      }
    }
    first = false;
    if (options.pages === false) break;

    const base = data.shop.primaryDomain.url.replace(/\/+$/, '');
    for (const page of data.pages.nodes) {
      if (!page.body?.trim()) continue;
      if (wanted ? !wanted.has(page.handle.toLowerCase()) : SYSTEM_PAGES.has(page.handle)) continue;
      const url = page.onlineStoreUrl || `${base}/pages/${encodeURIComponent(page.handle)}`;
      docs.push({ slug: `${SLUG_PREFIX}page-${slugPart(page.handle)}`, title: page.title, content: withSource(page.body, url), kind: 'page' });
    }
    if (!data.pages.pageInfo.hasNextPage || !data.pages.pageInfo.endCursor) break;
    after = data.pages.pageInfo.endCursor;
  }
  return docs;
}

/** Text without tags, entities decoded, whitespace collapsed: what the reader sees. */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export type SyncAction =
  | { type: 'create'; doc: KnowledgeDoc }
  | { type: 'update'; doc: KnowledgeDoc; article: Article; publish: boolean }
  | { type: 'unchanged'; doc: KnowledgeDoc; article: Article }
  | { type: 'unpublish'; article: Article }
  | { type: 'conflict'; doc: KnowledgeDoc; article: Article };

export function isSynced(article: Article): boolean {
  return article.slug.startsWith(SLUG_PREFIX) && (article.tags ?? []).includes(SYNC_TAG);
}

/**
 * What to do for each document and each synced article. Reading an
 * article's content (getContent) happens only for slugs that already exist.
 */
export async function planSync(
  docs: KnowledgeDoc[],
  existing: Article[],
  getContent: (article: Article) => Promise<string>,
  status: 'published' | 'draft',
): Promise<SyncAction[]> {
  const bySlug = new Map(existing.map((a) => [a.slug, a]));
  const actions: SyncAction[] = [];
  const seen = new Set<string>();

  for (const doc of docs) {
    if (seen.has(doc.slug)) continue;
    seen.add(doc.slug);
    const article = bySlug.get(doc.slug);
    if (!article) {
      actions.push({ type: 'create', doc });
      continue;
    }
    if (!isSynced(article)) {
      actions.push({ type: 'conflict', doc, article });
      continue;
    }
    const same = article.title === doc.title && plainText(await getContent(article)) === plainText(doc.content);
    // A synced article that went back to draft (its page was gone) is published again when it returns.
    const publish = status === 'published' && article.status !== 'published';
    actions.push(same && !publish ? { type: 'unchanged', doc, article } : { type: 'update', doc, article, publish });
  }

  for (const article of existing) {
    if (isSynced(article) && !seen.has(article.slug) && article.status === 'published') {
      actions.push({ type: 'unpublish', article });
    }
  }
  return actions;
}

export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  unpublished: number;
  conflicts: string[];
}

export async function applySync(api: ReplyzeApi, actions: SyncAction[], status: 'published' | 'draft'): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, unpublished: 0, conflicts: [] };
  for (const action of actions) {
    switch (action.type) {
      case 'create': {
        const input: ArticleInput = { title: action.doc.title, slug: action.doc.slug, content: action.doc.content, status, tags: [SYNC_TAG, 'shopify'] };
        const key = createHash('sha256').update(`${action.doc.slug}\n${action.doc.title}\n${action.doc.content}`).digest('hex').slice(0, 40);
        await api.createArticle(input, `shopify-sync-${key}`);
        result.created++;
        break;
      }
      case 'update': {
        const input: ArticleInput = { title: action.doc.title, content: action.doc.content };
        if (action.publish) input.status = 'published';
        await api.updateArticle(action.article.id, input);
        result.updated++;
        break;
      }
      case 'unchanged':
        result.unchanged++;
        break;
      case 'unpublish':
        await api.updateArticle(action.article.id, { status: 'draft' });
        result.unpublished++;
        break;
      case 'conflict':
        result.conflicts.push(action.doc.slug);
        break;
    }
  }
  return result;
}
