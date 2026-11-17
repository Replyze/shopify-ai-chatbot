/**
 * The service: a few routes on node:http, no framework, no database.
 *
 *   GET  /                 app home (Shopify opens it after install)
 *   GET  /health           liveness
 *   GET  /lookup/products  live product facts for Replyze Live data (Bearer key)
 *   GET  /proxy/identity   signed-in customer → Replyze user_hash (Shopify app proxy)
 *   POST /webhooks         Shopify webhooks (HMAC-verified)
 *
 * Run: npm start (reads .env when present).
 */
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { describeFeatures, loadConfig, type Config } from './config.ts';
import { sendError, type Handler } from './http.ts';
import { appProxyIdentity } from './routes/appProxy.ts';
import { home } from './routes/home.ts';
import { productLookup } from './routes/productLookup.ts';
import { webhooks } from './routes/webhooks.ts';
import { DemoProductSource, StorefrontProductSource, type DemoProduct, type ProductSource } from './services/products.ts';
import { StorefrontClient } from './services/storefront.ts';

export interface AppDeps {
  /** Overrides the product source picked from the config (tests, the demo). */
  productSource?: ProductSource | null;
  log?: (line: string) => void;
}

export function demoProducts(): DemoProduct[] {
  const file = fileURLToPath(new URL('../demo/data/store.json', import.meta.url));
  return (JSON.parse(readFileSync(file, 'utf8')) as { products: DemoProduct[] }).products;
}

export function productSourceFor(config: Config): ProductSource | null {
  if (config.demoMode) return new DemoProductSource(demoProducts(), config.publicUrl ?? `http://localhost:${config.port}`);
  if (!config.shopify.storeDomain) return null;
  return new StorefrontProductSource(
    new StorefrontClient({ storeDomain: config.shopify.storeDomain, apiVersion: config.shopify.apiVersion, token: config.shopify.storefrontToken }),
  );
}

export function createRoutes(config: Config, deps: AppDeps = {}): Map<string, Handler> {
  const source = deps.productSource !== undefined ? deps.productSource : productSourceFor(config);
  return new Map<string, Handler>([
    ['/', home(config)],
    ['/health', (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"ok":true}'); }],
    ['/lookup/products', productLookup({ source, apiKey: config.lookupApiKey, trustProxy: config.trustProxy })],
    ['/proxy/identity', appProxyIdentity({ clientSecret: config.shopify.clientSecret, identitySecret: config.replyze.identitySecret, storeDomain: config.shopify.storeDomain, trustProxy: config.trustProxy })],
    ['/webhooks', webhooks({ clientSecret: config.shopify.clientSecret, log: deps.log })],
  ]);
}

/** A request handler for these routes; unknown paths are 404. Errors never leak details. */
export function createHandler(routes: Map<string, Handler>, log: (line: string) => void = console.error) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = routes.get(url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname);
    try {
      if (!route) return sendError(res, 404, 'not_found', 'No such route.');
      await route(req, res, url);
    } catch (error) {
      log(`error on ${req.method} ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) sendError(res, 500, 'internal_error', 'Something went wrong.');
      else res.end();
    }
  };
}

export function createApp(config: Config, deps: AppDeps = {}): Server {
  return createServer(createHandler(createRoutes(config, deps), deps.log));
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { config, errors } = loadConfig();
  if (errors.length) {
    console.error(`Settings to fix:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  createApp(config).listen(config.port, () => {
    console.log(`Replyze chat for Shopify on http://localhost:${config.port}${config.demoMode ? ' (demo product data)' : ''}`);
    for (const line of describeFeatures(config)) console.log(`  ${line}`);
  });
}
