/**
 * POST /webhooks: Shopify webhooks, verified with the app's client secret
 * before anything else is read.
 *
 * This app keeps no customer data and no store data, so the three privacy
 * (compliance) topics have nothing to export or erase: they are acknowledged
 * and logged by topic and shop only. Payloads are never logged, because
 * customers/redact and customers/data_request carry customer details.
 */
import { PayloadTooLarge, readBody, sendError, sendJson, type Handler } from '../http.ts';
import { verifyWebhookHmac } from '../services/shopifySignatures.ts';

export const COMPLIANCE_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'] as const;
export const HANDLED_TOPICS = [...COMPLIANCE_TOPICS, 'app/uninstalled'] as const;

export interface WebhookDeps {
  clientSecret: string | null;
  log?: (line: string) => void;
}

function header(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function webhooks(deps: WebhookDeps): Handler {
  const log = deps.log ?? ((line: string) => console.log(line));

  return async (req, res) => {
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Use POST.', { Allow: 'POST' });
    if (!deps.clientSecret) return sendError(res, 503, 'not_configured', 'Webhooks need SHOPIFY_CLIENT_SECRET.');

    let body: Buffer;
    try {
      body = await readBody(req, 1_000_000);
    } catch (error) {
      if (error instanceof PayloadTooLarge) return sendError(res, 413, 'too_large', 'The webhook body is too large.');
      throw error;
    }

    // Shopify expects 401 for a webhook whose HMAC doesn't match.
    if (!verifyWebhookHmac(body, header(req.headers['x-shopify-hmac-sha256']), deps.clientSecret)) {
      return sendError(res, 401, 'bad_hmac', 'The webhook signature does not match.');
    }

    const topic = header(req.headers['x-shopify-topic']) ?? 'unknown';
    const shop = header(req.headers['x-shopify-shop-domain']) ?? 'unknown';
    const known = (HANDLED_TOPICS as readonly string[]).includes(topic);
    log(`webhook ${topic} from ${shop}${known ? '' : ' (not handled, acknowledged)'}: no stored data to change`);
    return sendJson(res, 200, { ok: true });
  };
}
