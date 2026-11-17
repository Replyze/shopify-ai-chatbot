/**
 * Copies the store's policies and pages into the Replyze knowledge base.
 *
 *   npm run sync:knowledge -- --dry-run          show what would change, change nothing
 *   npm run sync:knowledge                       create and update articles (published)
 *   npm run sync:knowledge -- --draft            new articles as drafts, to review first
 *   npm run sync:knowledge -- --no-pages         policies only
 *   npm run sync:knowledge -- --pages=faq,contact   policies and these pages only
 *   npm run sync:knowledge -- --no-policies      pages only
 *
 * Needs SHOPIFY_STORE_DOMAIN and REPLYZE_API_KEY (a key with knowledge:write).
 * Run it again whenever a policy or page changes, or on a schedule (cron).
 */
import { loadConfig } from '../app/config.ts';
import { applySync, collectStoreKnowledge, planSync, type CollectOptions } from '../app/services/knowledgeSync.ts';
import { ReplyzeApi, ReplyzeApiError } from '../app/services/replyzeApi.ts';
import { StorefrontClient, StorefrontError } from '../app/services/storefront.ts';

export interface SyncArgs {
  dryRun: boolean;
  status: 'published' | 'draft';
  collect: CollectOptions;
}

export function parseArgs(argv: string[]): SyncArgs {
  const args: SyncArgs = { dryRun: false, status: 'published', collect: { policies: true, pages: true } };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--draft') args.status = 'draft';
    else if (arg === '--no-pages') args.collect.pages = false;
    else if (arg === '--no-policies') args.collect.policies = false;
    else if (arg.startsWith('--pages=')) {
      const handles = arg.slice('--pages='.length).split(',').map((h) => h.trim()).filter(Boolean);
      if (handles.length === 0) throw new Error('--pages= needs page handles, like --pages=faq,contact');
      args.collect.pages = handles;
    } else throw new Error(`Unknown option ${arg}. Options: --dry-run --draft --no-pages --no-policies --pages=a,b`);
  }
  if (!args.collect.policies && args.collect.pages === false) throw new Error('Nothing to sync: both policies and pages are off.');
  return args;
}

async function main(): Promise<number> {
  let args: SyncArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const { config, errors } = loadConfig();
  const missing = [
    ...errors,
    ...(config.shopify.storeDomain ? [] : ['Set SHOPIFY_STORE_DOMAIN (your-store.myshopify.com).']),
    ...(config.replyze.apiKey ? [] : ['Set REPLYZE_API_KEY (Replyze: Settings → Integrations → Developer, scope knowledge:write).']),
  ];
  if (missing.length) {
    console.error(`Settings to fix:\n- ${missing.join('\n- ')}`);
    return 2;
  }

  const storefront = new StorefrontClient({ storeDomain: config.shopify.storeDomain!, apiVersion: config.shopify.apiVersion, token: config.shopify.storefrontToken, timeoutMs: 15000 });
  const api = new ReplyzeApi({ apiUrl: config.replyze.apiUrl, apiKey: config.replyze.apiKey! });

  try {
    const docs = await collectStoreKnowledge(storefront, args.collect);
    console.log(`Read ${docs.length} item(s) from ${config.shopify.storeDomain}: ${docs.map((d) => d.slug).join(', ') || 'nothing'}`);
    const existing = await api.listArticles();
    const plan = await planSync(docs, existing, async (article) => (await api.getArticle(article.id)).content ?? '', args.status);

    for (const action of plan) {
      const slug = 'doc' in action ? action.doc.slug : action.article.slug;
      const note = {
        create: `create (${args.status})`,
        update: 'update',
        unchanged: 'unchanged',
        unpublish: 'back to draft (gone from the store)',
        conflict: 'skipped: an article with this slug exists and was not made by this sync',
      }[action.type];
      console.log(`  ${slug}: ${note}`);
    }

    if (args.dryRun) {
      console.log('Dry run: nothing was changed.');
      return 0;
    }
    const result = await applySync(api, plan, args.status);
    console.log(`Done: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.unpublished} back to draft${result.conflicts.length ? `, ${result.conflicts.length} skipped` : ''}.`);
    return 0;
  } catch (error) {
    if (error instanceof StorefrontError || error instanceof ReplyzeApiError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.filename === process.argv[1];
if (isMain) process.exitCode = await main();
