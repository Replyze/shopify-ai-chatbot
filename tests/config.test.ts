import { describe, expect, it } from 'vitest';
import { describeFeatures, loadConfig } from '../app/config.ts';

const KEY = 'k'.repeat(40);

describe('loadConfig', () => {
  it('starts with nothing set: every feature off, defaults filled in', () => {
    const { config, errors } = loadConfig({});
    expect(errors).toEqual([]);
    expect(config.port).toBe(3000);
    expect(config.shopify.apiVersion).toBe('2026-10');
    expect(config.replyze.apiUrl).toBe('https://client.replyze.chat/api/v1');
    expect(config.demoMode).toBe(false);
    expect(config.lookupApiKey).toBeNull();
  });

  it('reads a full setup', () => {
    const { config, errors } = loadConfig({
      PORT: '8080',
      SHOPIFY_STORE_DOMAIN: 'Harbor-And-Pine.myshopify.com',
      SHOPIFY_CLIENT_SECRET: 'shpss_x',
      SHOPIFY_CLIENT_ID: 'abc',
      LOOKUP_API_KEY: KEY,
      REPLYZE_API_KEY: 'rpz_live_x',
      REPLYZE_IDENTITY_SECRET: 'id-secret',
      PUBLIC_URL: 'https://chat.example.com/',
      TRUST_PROXY: 'true',
    });
    expect(errors).toEqual([]);
    expect(config.shopify.storeDomain).toBe('harbor-and-pine.myshopify.com');
    expect(config.publicUrl).toBe('https://chat.example.com');
    expect(config.trustProxy).toBe(true);
  });

  it('takes what `shopify app dev` sets for the web process', () => {
    const { config } = loadConfig({ SHOPIFY_API_KEY: 'client-id', SHOPIFY_API_SECRET: 'secret', APP_URL: 'abc.trycloudflare.com' });
    expect(config.shopify.clientId).toBe('client-id');
    expect(config.shopify.clientSecret).toBe('secret');
    expect(config.publicUrl).toBe('https://abc.trycloudflare.com');
  });

  it('explains each wrong value', () => {
    const { errors } = loadConfig({
      PORT: 'eighty',
      SHOPIFY_STORE_DOMAIN: 'https://harborandpine.com',
      SHOPIFY_API_VERSION: '2026-11',
      LOOKUP_API_KEY: 'short',
      REPLYZE_API_KEY: 'sk_live_x',
      REPLYZE_API_URL: 'http://client.replyze.chat/api/v1',
      DEMO_MODE: 'maybe',
    });
    expect(errors).toHaveLength(7);
    expect(errors.join('\n')).toContain('myshopify.com');
    expect(errors.join('\n')).toContain('at least 32 characters');
  });

  it('allows http only for a local Replyze API', () => {
    expect(loadConfig({ REPLYZE_API_URL: 'http://localhost:8000/api/v1' }).errors).toEqual([]);
  });
});

describe('describeFeatures', () => {
  it('names what is missing and never prints a secret', () => {
    const { config } = loadConfig({ SHOPIFY_STORE_DOMAIN: 'demo.myshopify.com', LOOKUP_API_KEY: KEY, SHOPIFY_CLIENT_SECRET: 'shpss_supersecret' });
    const text = describeFeatures(config).join('\n');
    expect(text).toContain('on   GET  /lookup/products');
    expect(text).toContain('needs SHOPIFY_CLIENT_SECRET and REPLYZE_IDENTITY_SECRET');
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('supersecret');
  });
});
