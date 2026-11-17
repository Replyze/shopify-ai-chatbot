/** The service's routes over real HTTP: lookup, app proxy identity, webhooks, home. */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../app/config.ts';
import { createRoutes } from '../app/server.ts';
import { DemoProductSource, type ProductSource } from '../app/services/products.ts';
import { StorefrontError } from '../app/services/storefront.ts';
import { loadDemoStore } from '../demo/server.ts';
import { serve, signedProxyQuery, webhookHmac, type Running } from './helpers.ts';

const LOOKUP_KEY = 'lookup-key-'.padEnd(40, 'x');
const CLIENT_SECRET = 'shpss_test_secret';
const IDENTITY_SECRET = 'test-identity-secret';
const demo = new DemoProductSource(loadDemoStore().products, 'https://shop.example.com');

let running: Running | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

async function start(env: Record<string, string>, productSource?: ProductSource | null, log?: (line: string) => void) {
  const { config, errors } = loadConfig(env);
  expect(errors).toEqual([]);
  running = await serve(createRoutes(config, productSource === undefined ? {} : { productSource, log }), log);
  return running.url;
}

describe('GET /lookup/products', () => {
  const env = { LOOKUP_API_KEY: LOOKUP_KEY, DEMO_MODE: 'true' };
  const auth = { Authorization: `Bearer ${LOOKUP_KEY}` };

  it('answers product facts with the time they were checked', async () => {
    const url = await start(env, demo);
    const res = await fetch(`${url}/lookup/products?q=${encodeURIComponent('Do you have the merino sweater?')}`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.source).toBe('demo');
    expect(Date.parse(body.checked_at)).not.toBeNaN();
    expect(body.products[0]).toMatchObject({ title: 'Merino Crew Sweater', price: '$96.00', availability: 'available' });
    // Only public product facts, under column names Replyze shows to the AI.
    expect(Object.keys(body.products[0]).sort()).toEqual(['availability', 'description', 'price', 'title', 'url']);
  });

  it('refuses a missing or wrong key', async () => {
    const url = await start(env, demo);
    expect((await fetch(`${url}/lookup/products?q=mug`)).status).toBe(401);
    expect((await fetch(`${url}/lookup/products?q=mug`, { headers: { Authorization: `Bearer ${LOOKUP_KEY}y` } })).status).toBe(401);
    expect((await fetch(`${url}/lookup/products?q=mug&key=${LOOKUP_KEY}`)).status).toBe(401);
  });

  it('checks q and limit', async () => {
    const url = await start(env, demo);
    expect((await fetch(`${url}/lookup/products`, { headers: auth })).status).toBe(400);
    expect((await fetch(`${url}/lookup/products?q=${'a'.repeat(201)}`, { headers: auth })).status).toBe(400);
    expect((await fetch(`${url}/lookup/products?q=mug&limit=11`, { headers: auth })).status).toBe(400);
    expect((await fetch(`${url}/lookup/products?q=mug&limit=2`, { headers: auth })).status).toBe(200);
    expect((await fetch(`${url}/lookup/products?q=mug`, { method: 'POST', headers: auth })).status).toBe(405);
  });

  it('says what is missing when it is not set up', async () => {
    const url = await start({}, null);
    const res = await fetch(`${url}/lookup/products?q=mug`, { headers: auth });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toContain('LOOKUP_API_KEY');
  });

  it('passes Shopify trouble on as 502 without details of the request', async () => {
    const failing: ProductSource = { name: 'shopify-storefront', search: async () => { throw new StorefrontError('Shopify had a problem (503). Try again shortly.', 503); } };
    const url = await start(env, failing);
    const res = await fetch(`${url}/lookup/products?q=mug`, { headers: auth });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('shopify_unavailable');
  });

  it('limits how fast one address can call it', async () => {
    const url = await start(env, demo);
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await fetch(`${url}/lookup/products?q=mug`, { headers: auth })).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(120);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('GET /proxy/identity (app proxy)', () => {
  const env = { SHOPIFY_CLIENT_SECRET: CLIENT_SECRET, REPLYZE_IDENTITY_SECRET: IDENTITY_SECRET, SHOPIFY_STORE_DOMAIN: 'harbor.myshopify.com' };
  const now = () => String(Math.floor(Date.now() / 1000));
  const base = () => ({ shop: 'harbor.myshopify.com', path_prefix: '/apps/replyze-chat', timestamp: now() });

  it('signs a signed-in customer\'s id for Replyze', async () => {
    const url = await start(env);
    const res = await fetch(`${url}/proxy/identity?${signedProxyQuery({ ...base(), logged_in_customer_id: '7362714878' }, CLIENT_SECRET)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // Expected hash from: printf '%s' 'gid://shopify/Customer/7362714878' | openssl dgst -sha256 -hmac 'test-identity-secret'
    expect(await res.json()).toEqual({
      signed_in: true,
      user_id: 'gid://shopify/Customer/7362714878',
      user_hash: 'b0cdeccb41d290206971472cd0cb2f5739d21584944af8c70bd387cba090243d',
    });
  });

  it('tells a guest apart without signing anything', async () => {
    const url = await start(env);
    const res = await fetch(`${url}/proxy/identity?${signedProxyQuery({ ...base(), logged_in_customer_id: '' }, CLIENT_SECRET)}`);
    expect(await res.json()).toEqual({ signed_in: false });
  });

  it('refuses unsigned, tampered, old or other-store requests', async () => {
    const url = await start(env);
    const signed = signedProxyQuery({ ...base(), logged_in_customer_id: '1' }, CLIENT_SECRET);
    expect((await fetch(`${url}/proxy/identity?${signed.replace('logged_in_customer_id=1', 'logged_in_customer_id=2')}`)).status).toBe(401);
    expect((await fetch(`${url}/proxy/identity?logged_in_customer_id=1&shop=harbor.myshopify.com`)).status).toBe(401);
    expect((await fetch(`${url}/proxy/identity?${signedProxyQuery({ ...base(), logged_in_customer_id: '1' }, 'wrong-secret')}`)).status).toBe(401);
    const old = signedProxyQuery({ ...base(), timestamp: String(Math.floor(Date.now() / 1000) - 3600), logged_in_customer_id: '1' }, CLIENT_SECRET);
    expect((await fetch(`${url}/proxy/identity?${old}`)).status).toBe(401);
    const otherStore = signedProxyQuery({ ...base(), shop: 'other.myshopify.com', logged_in_customer_id: '1' }, CLIENT_SECRET);
    expect((await fetch(`${url}/proxy/identity?${otherStore}`)).status).toBe(403);
  });

  it('is off until both secrets are set', async () => {
    const url = await start({ SHOPIFY_CLIENT_SECRET: CLIENT_SECRET });
    expect((await fetch(`${url}/proxy/identity?${signedProxyQuery({ ...base(), logged_in_customer_id: '1' }, CLIENT_SECRET)}`)).status).toBe(503);
  });
});

describe('POST /webhooks', () => {
  const env = { SHOPIFY_CLIENT_SECRET: CLIENT_SECRET };
  const body = JSON.stringify({ shop_domain: 'harbor.myshopify.com', customer: { id: 1, email: 'ana@example.com', phone: '+15555550100' } });

  it('acknowledges a verified privacy webhook and logs no payload', async () => {
    const lines: string[] = [];
    const url = await start(env, null, (line) => lines.push(line));
    const res = await fetch(`${url}/webhooks`, {
      method: 'POST',
      body,
      headers: { 'X-Shopify-Hmac-SHA256': webhookHmac(body, CLIENT_SECRET), 'X-Shopify-Topic': 'customers/redact', 'X-Shopify-Shop-Domain': 'harbor.myshopify.com' },
    });
    expect(res.status).toBe(200);
    expect(lines.join('\n')).toContain('webhook customers/redact from harbor.myshopify.com');
    expect(lines.join('\n')).not.toContain('ana@example.com');
  });

  it('answers 401 to a wrong signature, as Shopify expects', async () => {
    const url = await start(env, null);
    const res = await fetch(`${url}/webhooks`, { method: 'POST', body, headers: { 'X-Shopify-Hmac-SHA256': webhookHmac(`${body} `, CLIENT_SECRET), 'X-Shopify-Topic': 'shop/redact' } });
    expect(res.status).toBe(401);
    expect((await fetch(`${url}/webhooks`, { method: 'POST', body })).status).toBe(401);
  });

  it('refuses huge bodies and other methods', async () => {
    const url = await start(env, null);
    const big = 'x'.repeat(1_000_001);
    expect((await fetch(`${url}/webhooks`, { method: 'POST', body: big, headers: { 'X-Shopify-Hmac-SHA256': webhookHmac(big, CLIENT_SECRET) } })).status).toBe(413);
    expect((await fetch(`${url}/webhooks`)).status).toBe(405);
  });
});

describe('GET / (app home)', () => {
  function launch(shop: string, secret: string): string {
    const params = new URLSearchParams({ shop, timestamp: String(Math.floor(Date.now() / 1000)), host: 'YWRtaW4' });
    const message = [...params].map(([k, v]) => `${k}=${v}`).sort().join('&');
    params.set('hmac', createHmac('sha256', secret).update(message).digest('hex'));
    return params.toString();
  }
  const env = { SHOPIFY_CLIENT_SECRET: CLIENT_SECRET, SHOPIFY_CLIENT_ID: 'client-123', LOOKUP_API_KEY: LOOKUP_KEY, PUBLIC_URL: 'https://chat.example.com' };

  it('links the theme editor\'s app embed for a request Shopify signed', async () => {
    const url = await start(env, null);
    const res = await fetch(`${url}/?${launch('harbor.myshopify.com', CLIENT_SECRET)}`);
    const html = await res.text();
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(html).toContain('https://harbor.myshopify.com/admin/themes/current/editor?context=apps&amp;activateAppId=client-123/replyze-chat');
    expect(html).toContain('https://chat.example.com/lookup');
    expect(html).not.toContain(LOOKUP_KEY);
    expect(html).not.toContain(CLIENT_SECRET);
  });

  it('shows the checklist without store details to anyone else', async () => {
    const url = await start(env, null);
    const html = await (await fetch(`${url}/?${launch('harbor.myshopify.com', 'forged')}`)).text();
    expect(html).not.toContain('harbor.myshopify.com');
    expect(html).toContain('App embeds');
  });

  it('answers 404 to unknown paths', async () => {
    const url = await start(env, null);
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });
});
