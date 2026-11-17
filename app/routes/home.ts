/**
 * GET /: the app's home (application_url in shopify.app.toml). Shopify opens
 * it after install and from the Apps menu, with `shop` and an `hmac` signed
 * with the client secret. A verified request gets a link straight to the
 * theme editor with the app embed selected; anyone else sees the same setup
 * checklist without store details. Nothing secret is ever shown.
 */
import type { Config } from '../config.ts';
import { escapeHtml, sendHtml, type Handler } from '../http.ts';
import { verifyAdminLaunchHmac } from '../services/shopifySignatures.ts';

/** The app embed's handle: the block file name in extensions/replyze-chat-embed/blocks. */
export const EMBED_HANDLE = 'replyze-chat';

export function themeEditorLink(shop: string, clientId: string): string {
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(clientId)}/${EMBED_HANDLE}`;
}

export function home(config: Config): Handler {
  return (req, res, url) => {
    const params = url.searchParams;
    const shop = params.get('shop');
    const verified =
      !!shop &&
      /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) &&
      !!config.shopify.clientSecret &&
      verifyAdminLaunchHmac(params, config.shopify.clientSecret);

    const base = config.publicUrl ?? 'https://<this service>';
    const check = (on: boolean) => (on ? '<span class="on">On</span>' : '<span class="off">Off</span>');
    const lookupOn = !!config.lookupApiKey && (config.demoMode || !!config.shopify.storeDomain);
    const identityOn = !!config.shopify.clientSecret && !!config.replyze.identitySecret;

    const embedStep =
      verified && config.shopify.clientId
        ? `<a class="button" href="${escapeHtml(themeEditorLink(shop!, config.shopify.clientId))}" target="_top">Open the theme editor on the app embed</a>`
        : 'In Shopify admin: Online Store → Themes → Customize → App embeds → <b>Replyze chat</b>.';

    sendHtml(
      res,
      200,
      `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Replyze chat for Shopify</title>
<style>
  :root { color-scheme: light dark; --fg: #0f172a; --muted: #475569; --bg: #f8fafc; --card: #fff; --line: #e2e8f0; --accent: #0e7490; --accent-ink: #fff; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e2e8f0; --muted: #94a3b8; --bg: #0b0f17; --card: #111827; --line: #1f2937; --accent: #67d4ea; --accent-ink: #0b0f17; } }
  body { margin: 0; font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--fg); background: var(--bg); }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  p.lead { color: var(--muted); margin: 0 0 24px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  h2 { font-size: 1.1rem; margin: 0 0 12px; }
  ol { margin: 0; padding-left: 1.3rem; }
  li { margin: 6px 0; }
  code { font-size: .9em; background: color-mix(in srgb, var(--accent) 10%, transparent); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 6px; border-top: 1px solid var(--line); vertical-align: top; }
  .on { color: #15803d; font-weight: 600; } .off { color: var(--muted); font-weight: 600; }
  .button { display: inline-block; background: var(--accent); color: var(--accent-ink); padding: 8px 14px; border-radius: 8px; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Replyze chat for Shopify</h1>
  <p class="lead">${verified ? `Installed on <b>${escapeHtml(shop!)}</b>.` : 'Self-hosted starter.'} The chat is the Replyze widget; its look is set in the theme editor and in Replyze.</p>
  <section>
    <h2>1. Show the chat on the store</h2>
    <ol>
      <li>${embedStep}</li>
      <li>Paste your widget token (<code>wgt_...</code>) from Replyze: Settings → Integrations → Install widget.</li>
      <li>In Replyze, add the store's domain under Settings → Chat Widget → Allowed domains.</li>
    </ol>
  </section>
  <section>
    <h2>2. What this service does</h2>
    <table>
      <tr><td>${check(lookupOn)}</td><td><b>Live product answers.</b> In Replyze, AI Agent → Live data: API source with base URL <code>${escapeHtml(base)}/lookup</code> and header <code>Authorization: Bearer &lt;LOOKUP_API_KEY&gt;</code>; lookup path <code>/products?q={product}</code>, rows at <code>products</code>.</td></tr>
      <tr><td>${check(identityOn)}</td><td><b>Signed-in customers.</b> App proxy <code>/apps/replyze-chat</code> → <code>${escapeHtml(base)}/proxy</code>; turn on "Identify signed-in customers" in the app embed.</td></tr>
      <tr><td>${check(!!config.shopify.clientSecret)}</td><td><b>Webhooks</b> at <code>${escapeHtml(base)}/webhooks</code>, verified with the client secret.</td></tr>
    </table>
  </section>
  <section>
    <h2>3. Store knowledge</h2>
    <p>Run <code>npm run sync:knowledge</code> to copy the store's policies and pages into the Replyze knowledge base.</p>
  </section>
</main>
</body>
</html>`,
    );
  };
}
