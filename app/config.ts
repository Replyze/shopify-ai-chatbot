/**
 * The service's settings, read from environment variables and checked once
 * at start. Every feature is optional: a route whose settings are missing
 * answers 503 and says which variable it needs, so you can turn on one
 * piece at a time. Secrets are never printed, only whether they are set.
 */

export interface Config {
  port: number;
  /** This service's public https URL (for the setup page and demo links). */
  publicUrl: string | null;
  /** Read the caller's address from X-Forwarded-For (behind a reverse proxy). */
  trustProxy: boolean;
  /** Product data comes from demo/data/store.json instead of a Shopify store. */
  demoMode: boolean;
  shopify: {
    /** your-store.myshopify.com: where the Storefront API is asked for products. */
    storeDomain: string | null;
    apiVersion: string;
    /** The app's client id (public): links the theme editor's app embed on the setup page. */
    clientId: string | null;
    /** Optional Storefront API public access token; without it the tokenless Storefront API is used. */
    storefrontToken: string | null;
    /** The app's client secret: verifies webhooks and app proxy requests. */
    clientSecret: string | null;
  };
  replyze: {
    /** REST API v1 base URL. */
    apiUrl: string;
    /** A workspace API key with knowledge:read and knowledge:write, for the knowledge sync. */
    apiKey: string | null;
    /** The widget's identity verification secret: signs signed-in Shopify customers. */
    identitySecret: string | null;
  };
  /** The key Replyze's Live data source sends (Authorization: Bearer ...) to the product lookup. */
  lookupApiKey: string | null;
}

export interface ConfigResult {
  config: Config;
  errors: string[];
}

export const DEFAULT_API_VERSION = '2026-10';
export const DEFAULT_REPLYZE_API_URL = 'https://client.replyze.chat/api/v1';

type Env = Record<string, string | undefined>;

function text(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function loadConfig(env: Env = process.env): ConfigResult {
  const errors: string[] = [];

  const portText = text(env, 'PORT') ?? '3000';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be a number from 1 to 65535 (got "${portText}").`);
  }

  const demoText = (text(env, 'DEMO_MODE') ?? 'false').toLowerCase();
  if (!['true', 'false', '1', '0'].includes(demoText)) {
    errors.push('DEMO_MODE must be true or false.');
  }
  const demoMode = demoText === 'true' || demoText === '1';

  const storeDomain = text(env, 'SHOPIFY_STORE_DOMAIN')?.toLowerCase() ?? null;
  if (storeDomain && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    errors.push('SHOPIFY_STORE_DOMAIN must be the store\'s myshopify.com domain, like your-store.myshopify.com (no https://, no custom domain).');
  }

  const apiVersion = text(env, 'SHOPIFY_API_VERSION') ?? DEFAULT_API_VERSION;
  if (!/^\d{4}-(01|04|07|10)$/.test(apiVersion)) {
    errors.push(`SHOPIFY_API_VERSION must be a quarterly version like ${DEFAULT_API_VERSION}.`);
  }

  const replyzeApiUrl = (text(env, 'REPLYZE_API_URL') ?? DEFAULT_REPLYZE_API_URL).replace(/\/+$/, '');
  if (!isHttpsOrLocal(replyzeApiUrl)) {
    errors.push('REPLYZE_API_URL must be an https:// URL.');
  }

  const replyzeApiKey = text(env, 'REPLYZE_API_KEY');
  if (replyzeApiKey && !replyzeApiKey.startsWith('rpz_')) {
    errors.push('REPLYZE_API_KEY should be a Replyze workspace API key (it starts with rpz_). Make one in Settings → Integrations → Developer.');
  }

  const lookupApiKey = text(env, 'LOOKUP_API_KEY');
  if (lookupApiKey && lookupApiKey.length < 32) {
    errors.push('LOOKUP_API_KEY must be at least 32 characters. Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
  }

  const identitySecret = text(env, 'REPLYZE_IDENTITY_SECRET');

  // `shopify app dev` sets APP_URL (its tunnel) and SHOPIFY_API_KEY / SHOPIFY_API_SECRET for the web process.
  const rawPublicUrl = text(env, 'PUBLIC_URL') ?? text(env, 'APP_URL');
  const publicUrl = rawPublicUrl ? (/^https?:\/\//.test(rawPublicUrl) ? rawPublicUrl : `https://${rawPublicUrl}`).replace(/\/+$/, '') : null;
  if (publicUrl && !isHttpsOrLocal(publicUrl)) {
    errors.push('PUBLIC_URL must be the https:// address this service is reachable at.');
  }

  const proxyText = (text(env, 'TRUST_PROXY') ?? 'false').toLowerCase();
  if (!['true', 'false', '1', '0'].includes(proxyText)) errors.push('TRUST_PROXY must be true or false.');

  return {
    config: {
      port,
      publicUrl,
      trustProxy: proxyText === 'true' || proxyText === '1',
      demoMode,
      shopify: {
        storeDomain,
        apiVersion,
        clientId: text(env, 'SHOPIFY_CLIENT_ID') ?? text(env, 'SHOPIFY_API_KEY'),
        storefrontToken: text(env, 'SHOPIFY_STOREFRONT_TOKEN'),
        clientSecret: text(env, 'SHOPIFY_CLIENT_SECRET') ?? text(env, 'SHOPIFY_API_SECRET'),
      },
      replyze: {
        apiUrl: replyzeApiUrl,
        apiKey: replyzeApiKey,
        identitySecret,
      },
      lookupApiKey,
    },
    errors,
  };
}

function isHttpsOrLocal(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** What runs with these settings, for the start-up log. Never prints a secret. */
export function describeFeatures(config: Config): string[] {
  const on = (yes: boolean) => (yes ? 'on ' : 'off');
  const products = config.demoMode || config.shopify.storeDomain !== null;
  return [
    `${on(products && config.lookupApiKey !== null)}  GET  /lookup/products   live product lookup for Replyze Live data` +
      (config.demoMode ? ' (demo data)' : config.shopify.storeDomain ? ` (${config.shopify.storeDomain})` : '') +
      (config.lookupApiKey ? '' : '  needs LOOKUP_API_KEY'),
    `${on(config.shopify.clientSecret !== null && config.replyze.identitySecret !== null)}  GET  /proxy/identity     signed-in customers via the app proxy` +
      (config.shopify.clientSecret && config.replyze.identitySecret ? '' : '  needs SHOPIFY_CLIENT_SECRET and REPLYZE_IDENTITY_SECRET'),
    `${on(config.shopify.clientSecret !== null)}  POST /webhooks           Shopify webhooks (HMAC-verified)` +
      (config.shopify.clientSecret ? '' : '  needs SHOPIFY_CLIENT_SECRET'),
  ];
}
