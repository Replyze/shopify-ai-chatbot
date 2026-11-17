/**
 * The theme app extension's Liquid, rendered with liquidjs (Shopify's
 * {% schema %} tag registered) the way the theme would render it, and the
 * script it outputs run in a sandbox.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { BLOCK_FILE, liquidEngine, renderEmbed, schemaDefaults } from '../demo/server.ts';

const engine = liquidEngine();
const source = readFileSync(BLOCK_FILE, 'utf8');

function inlineScript(html: string): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('no inline script');
  return match[1]!;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#34;': '"' };

/** The data-* attributes of the block's <template>, as the browser's element.dataset would give them. */
function dataset(html: string): Record<string, string> {
  const tag = /<template id="replyze-shopify-embed"([\s\S]*?)><\/template>/.exec(html);
  if (!tag) throw new Error('no settings element');
  const data: Record<string, string> = {};
  for (const [, name, value] of tag[1]!.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
    const key = name!.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    data[key] = value!.replace(/&(amp|lt|gt|quot|#39|#34);/g, (e) => ENTITIES[e]!);
  }
  return data;
}

/** Runs the block's inline script in a fake browser and returns what it set up. */
function run(html: string, extra: { localStorage?: Map<string, string>; fetchAnswer?: unknown; window?: Record<string, unknown> } = {}) {
  const store = extra.localStorage ?? new Map<string, string>();
  const fetched: string[] = [];
  const window: Record<string, unknown> = {
    ...extra.window,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  const element = { dataset: dataset(html) };
  const sandbox = {
    window,
    document: {
      addEventListener: () => undefined,
      getElementById: (id: string) => (id === 'replyze-shopify-embed' ? element : null),
    },
    fetch: async (url: string) => {
      fetched.push(url);
      return { ok: true, json: async () => extra.fetchAnswer ?? { signed_in: false } };
    },
  };
  runInNewContext(inlineScript(html), sandbox);
  return { window, fetched, store };
}

describe('schema', () => {
  const schema = JSON.parse(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/.exec(source)![1]!) as {
    target: string;
    settings: Array<{ id?: string; type: string; default?: unknown; options?: Array<{ value: string }> }>;
  };

  it('is an app embed in the body, with unique setting ids and valid defaults', () => {
    expect(schema.target).toBe('body');
    const ids = schema.settings.filter((s) => s.id).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const setting of schema.settings) {
      if (setting.type === 'select') expect(setting.options!.map((o) => o.value)).toContain(setting.default);
    }
  });

  it('keeps the privacy-related switches off by default', () => {
    const defaults = schemaDefaults(source);
    expect(defaults.identify_customers).toBe(false);
    expect(defaults.share_contact_details).toBe(false);
  });

  it('stays within Shopify\'s limits for theme app extensions (100 KB of Liquid)', () => {
    expect(Buffer.byteLength(source)).toBeLessThan(100 * 1024);
  });
});

describe('rendering', () => {
  it('outputs nothing without a valid widget token, and a hint in the theme editor', async () => {
    expect((await renderEmbed(engine, { settings: { widget_token: '' } })).trim()).toBe('');
    expect((await renderEmbed(engine, { settings: { widget_token: 'not-a-token' } })).trim()).toBe('');
    expect(await renderEmbed(engine, { settings: { widget_token: '' }, designMode: true })).toContain('Paste your widget token');
  });

  it('loads widget.js from the Replyze CDN with the token and the look set in the theme editor', async () => {
    const html = await renderEmbed(engine, {
      settings: { widget_token: ' wgt_abc123 ', color: '#1f5f4a', position: 'bottom_left', bot_name: 'Pine', auto_open: '15', greeting_teaser: 'off' },
    });
    expect(html).toContain('<script src="https://cdn.replyze.chat/widget.js" async></script>');
    const { window } = run(html);
    expect(window.ReplyzeConfig).toEqual({
      token: 'wgt_abc123',
      apiUrl: 'https://client.replyze.chat',
      tracking: false,
      overrides: { color: '#1f5f4a', position: 'bottom_left', bot_name: 'Pine', show_greeting_teaser: false, auto_open_delay: 15 },
    });
  });

  it('leaves "Use Replyze setting" out of the overrides', async () => {
    const { window } = run(await renderEmbed(engine, { settings: { widget_token: 'wgt_abc' } }));
    expect((window.ReplyzeConfig as { overrides: object }).overrides).toEqual({});
  });

  it('keeps text from settings out of the script: no </script> or quote breaks out', async () => {
    const evil = 'Hi </script><script>alert(1)</script> "><img src=x onerror=alert(2)>';
    const html = await renderEmbed(engine, { settings: { widget_token: 'wgt_abc', welcome_message: evil, bot_name: evil } });
    expect(html.match(/<\/script>/g)).toHaveLength(2); // the inline script's own end, and widget.js's
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>alert');
    const { window } = run(html);
    const overrides = (window.ReplyzeConfig as { overrides: { welcome_message: string; bot_name: string } }).overrides;
    expect(overrides.welcome_message).toBe(evil);
    expect(overrides.bot_name).toBe(evil);
  });

  it('the inline script contains no Liquid output at all', async () => {
    const plain = inlineScript(await renderEmbed(engine, { settings: { widget_token: 'wgt_abc', identify_customers: true } }));
    const styled = inlineScript(await renderEmbed(engine, { settings: { widget_token: 'wgt_other', bot_name: 'X', color: '#000000', identify_customers: true, share_contact_details: true }, customer: { id: 1, name: 'A', email: 'a@b.c' } }));
    expect(styled).toBe(plain);
  });

  it('keeps a Replyze server the page chose (the local demo)', async () => {
    const html = await renderEmbed(engine, { settings: { widget_token: 'wgt_abc' } });
    const { window } = run(html, { window: { ReplyzeConfig: { apiUrl: 'http://localhost:4300' } } });
    expect((window.ReplyzeConfig as { apiUrl: string }).apiUrl).toBe('http://localhost:4300');
  });
});

describe('signed-in customers', () => {
  const customer = { id: 7362714878, name: 'Ana Ruiz', email: 'ana@example.com' };

  it('asks the app proxy for a signature, then identifies with id and hash only', async () => {
    const html = await renderEmbed(engine, { settings: { widget_token: 'wgt_abc', identify_customers: true }, customer });
    expect(html).not.toContain('ana@example.com');
    const { window, fetched, store } = run(html, { fetchAnswer: { signed_in: true, user_id: 'gid://shopify/Customer/7362714878', user_hash: 'abc' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetched).toEqual(['/apps/replyze-chat/identity']);
    expect((window.Replyze as { _queue: unknown[] })._queue).toEqual([['identify', { user_id: 'gid://shopify/Customer/7362714878', user_hash: 'abc' }]]);
    expect(store.get('replyze_shopify_customer')).toBe('gid://shopify/Customer/7362714878');
  });

  it('adds name and email only when that switch is on', async () => {
    const html = await renderEmbed(engine, { settings: { widget_token: 'wgt_abc', identify_customers: true, share_contact_details: true }, customer });
    const { window } = run(html, { fetchAnswer: { signed_in: true, user_id: 'u', user_hash: 'h' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((window.Replyze as { _queue: unknown[] })._queue).toEqual([['identify', { user_id: 'u', user_hash: 'h', name: 'Ana Ruiz', email: 'ana@example.com' }]]);
  });

  it('lets the customer go after they sign out', async () => {
    const html = await renderEmbed(engine, { settings: { widget_token: 'wgt_abc', identify_customers: true }, customer: null });
    const { window, fetched, store } = run(html, { localStorage: new Map([['replyze_shopify_customer', 'gid://shopify/Customer/1']]) });
    expect(fetched).toEqual([]);
    expect((window.Replyze as { _queue: unknown[] })._queue).toEqual([['reset']]);
    expect(store.has('replyze_shopify_customer')).toBe(false);
  });

  it('does nothing about identity while the switch is off', async () => {
    const html = await renderEmbed(engine, { settings: { widget_token: 'wgt_abc' }, customer });
    expect(html).not.toContain('data-identify');
    expect(html).not.toContain('ana@example.com');
    const { window, fetched } = run(html);
    expect(fetched).toEqual([]);
    expect(window.Replyze).toBeUndefined();
  });
});
