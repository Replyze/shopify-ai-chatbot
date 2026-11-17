/**
 * The local demo: a fictional Shopify-style store with the app embed's real
 * Liquid rendered on every page, and the real Replyze widget.js from
 * cdn.replyze.chat.
 *
 * Demo mode (default): the widget talks to a scripted stand-in for the
 * Replyze API (demo/fakeReplyzeApi.ts). No account, no AI.
 * Live mode (REPLYZE_WIDGET_TOKEN=wgt_...): the widget talks to your Replyze
 * workspace at client.replyze.chat. Add localhost to its allowed domains.
 *
 *   npm run demo            → http://localhost:4300
 */
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Liquid, Tag, type Context, type Emitter, type TagToken, type TopLevelToken } from 'liquidjs';
import { loadConfig } from '../app/config.ts';
import { sendJson } from '../app/http.ts';
import { createHandler, createRoutes } from '../app/server.ts';
import { DemoProductSource } from '../app/services/products.ts';
import type { DemoStore } from './answers.ts';
import { createFakeReplyzeApi } from './fakeReplyzeApi.ts';
import { helpPage, homePage, notFoundPage, productPage, productSvg, STYLES, type DemoMode } from './pages.ts';

export const DEMO_TOKEN = 'wgt_demo_harbor_and_pine';
/** Only for the local demo's /lookup/products. Not a secret. */
export const DEMO_LOOKUP_KEY = 'demo-lookup-key-not-a-secret-0000000000';

const root = fileURLToPath(new URL('..', import.meta.url));
export const BLOCK_FILE = `${root}extensions/replyze-chat-embed/blocks/replyze-chat.liquid`;

export function loadDemoStore(): DemoStore {
  return JSON.parse(readFileSync(`${root}demo/data/store.json`, 'utf8')) as DemoStore;
}

/** A Liquid engine with Shopify's {% schema %} tag (rendered as nothing). */
export function liquidEngine(): Liquid {
  const engine = new Liquid({ strictFilters: true });
  engine.registerTag(
    'schema',
    class extends Tag {
      constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
        super(token, remainTokens, liquid);
        while (remainTokens.length) {
          const next = remainTokens.shift() as TopLevelToken & { name?: string };
          if (next.name === 'endschema') return;
        }
        throw new Error('{% schema %} without {% endschema %}');
      }
      render(_ctx: Context, _emitter: Emitter): void {}
    },
  );
  // Shopify filters the block uses; image_url only matters for a picked image, which the demo doesn't set.
  engine.registerFilter('image_url', (value: unknown) => String(value ?? ''));
  return engine;
}

/** The schema's default for each setting, so the demo renders what a fresh install would. */
export function schemaDefaults(blockSource: string): Record<string, unknown> {
  const json = /{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/.exec(blockSource)?.[1];
  if (!json) throw new Error('The block has no schema.');
  const schema = JSON.parse(json) as { settings: Array<{ id?: string; default?: unknown; type: string }> };
  const settings: Record<string, unknown> = {};
  for (const s of schema.settings) {
    if (!s.id) continue;
    settings[s.id] = s.default ?? (s.type === 'checkbox' ? false : '');
  }
  return settings;
}

export interface RenderEmbedOptions {
  settings?: Record<string, unknown>;
  customer?: { id: number; name: string; email: string } | null;
  designMode?: boolean;
}

export async function renderEmbed(engine: Liquid, options: RenderEmbedOptions = {}): Promise<string> {
  const source = readFileSync(BLOCK_FILE, 'utf8');
  const settings = { ...schemaDefaults(source), ...(options.settings ?? {}) };
  return engine.parseAndRender(source, {
    block: { settings },
    customer: options.customer ?? null,
    request: { design_mode: options.designMode ?? false },
  });
}

export interface DemoServerOptions {
  port: number;
  widgetToken?: string | null;
  /** Serve another widget.js than the CDN's (a local build). */
  widgetSrc?: string | null;
  replyDelayMs?: number;
}

export async function createDemoServer(options: DemoServerOptions): Promise<{ server: Server; mode: DemoMode }> {
  const data = loadDemoStore();
  const engine = liquidEngine();
  const live = options.widgetToken && options.widgetToken.startsWith('wgt_') ? options.widgetToken : null;
  const mode: DemoMode = live ? { kind: 'live', tokenHint: `${live.slice(0, 8)}…` } : { kind: 'demo' };
  let baseUrl = `http://localhost:${options.port}`;

  let embed = await renderEmbed(engine, { settings: { widget_token: live ?? DEMO_TOKEN, color: '#1f5f4a' } });
  if (!live) {
    // Point the widget at this server's scripted API before the block's script runs.
    embed = `<script>window.ReplyzeConfig = { apiUrl: location.origin };</script>\n${embed}`;
  }
  if (options.widgetSrc) embed = embed.replace('https://cdn.replyze.chat/widget.js', options.widgetSrc);

  const fakeApi = createFakeReplyzeApi({ token: DEMO_TOKEN, data, get baseUrl() { return baseUrl; }, replyDelayMs: options.replyDelayMs });
  const { config } = loadConfig({ DEMO_MODE: 'true', LOOKUP_API_KEY: process.env.LOOKUP_API_KEY ?? DEMO_LOOKUP_KEY, PORT: String(options.port) });
  const appRoutes = createRoutes(config, { productSource: new DemoProductSource(data.products, baseUrl) });
  const app = createHandler(appRoutes);
  const byHandle = new Map(data.products.map((p) => [p.handle, p]));

  const html = (res: ServerResponse, status: number, body: string) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    baseUrl = `http://${req.headers.host ?? `localhost:${options.port}`}`;
    try {
      if (await fakeApi(req, res, url)) return;
      if (url.pathname.startsWith('/lookup/') || url.pathname === '/health') return app(req, res);
      if (url.pathname === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        return void res.end(STYLES);
      }
      const image = /^\/images\/([a-z0-9-]+)\.svg$/.exec(url.pathname);
      if (image) {
        const product = byHandle.get(image[1]!);
        if (!product) return sendJson(res, 404, { error: 'No such image' });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
        return void res.end(productSvg(product));
      }
      if (url.pathname === '/') return html(res, 200, homePage(data, mode, embed));
      if (url.pathname === '/pages/help') return html(res, 200, helpPage(data, mode, embed));
      const productMatch = /^\/products\/([a-z0-9-]+)$/.exec(url.pathname);
      const product = productMatch ? byHandle.get(productMatch[1]!) : undefined;
      if (product) return html(res, 200, productPage(data, mode, embed, product));
      return html(res, 404, notFoundPage(data, mode, embed));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Demo server error' });
    }
  });
  return { server, mode };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.DEMO_PORT ?? 4300);
  const { server, mode } = await createDemoServer({
    port,
    widgetToken: process.env.REPLYZE_WIDGET_TOKEN ?? null,
    widgetSrc: process.env.REPLYZE_WIDGET_SRC ?? null,
  });
  server.listen(port, () => {
    console.log(`Harbor & Pine demo store: http://localhost:${port}`);
    console.log(
      mode.kind === 'demo'
        ? '  Demo mode: the real Replyze widget with scripted answers (no AI, no account).'
        : `  Live mode: widget ${mode.tokenHint} on your Replyze workspace. Add localhost to its allowed domains.`,
    );
    console.log(`  Product lookup: curl -H "Authorization: Bearer ${process.env.LOOKUP_API_KEY ? '<LOOKUP_API_KEY>' : DEMO_LOOKUP_KEY}" "http://localhost:${port}/lookup/products?q=earbuds"`);
  });
}
