# Troubleshooting

## The chat doesn't show on the store

1. **App embed off.** Online Store → Themes → Customize → App embeds: is **Replyze chat** on, and is the change saved on the live theme (not a draft)?
2. **Token.** It must start with `wgt_`. Without a valid token the block adds nothing; in the theme editor it shows a reminder instead.
3. **Allowed domains.** If Replyze lists allowed domains (Settings → Chat Widget), the store's `myshopify.com` domain and its custom domain must both be there. Otherwise the browser console shows a CORS error for `client.replyze.chat`.
4. **Ad or script blockers** can block `cdn.replyze.chat`. The store keeps working without the chat.
5. **Page rules.** Replyze's widget settings can hide the widget on some pages; check them.

## Changes in the theme editor don't show

The widget reads them when the page loads: reload the store page. Fields left empty or on "Use Replyze setting" take Replyze's value.

## `npm start` refuses to start

It lists each wrong setting. Common ones:

- `SHOPIFY_STORE_DOMAIN` must be `your-store.myshopify.com`, not `https://...` or the custom domain.
- `LOOKUP_API_KEY` must be 32 characters or more.
- Node older than 22.18 can't run `.ts` files: `node --version`.

## The product lookup answers…

| Status | Meaning |
|---|---|
| `401 unauthorized` | The `Authorization: Bearer` header is missing or the key differs from `LOOKUP_API_KEY`. In Replyze the header value must include `Bearer `. |
| `400 query_required` | `q` was empty after removing punctuation. The lookup path must be `/products?q={product}`. |
| `503 not_configured` | Set `LOOKUP_API_KEY` and `SHOPIFY_STORE_DOMAIN` (or `DEMO_MODE=true`), then restart. |
| `502 shopify_unavailable` | Shopify refused or failed. The message says why: a wrong domain or API version (404), a store that doesn't allow tokenless Storefront access (401/403; set `SHOPIFY_STOREFRONT_TOKEN`), or a frozen store (402). |
| `429` | Over 120 lookups a minute from one address. |

**Replyze says it can't connect.** Live data calls the base URL over HTTPS from the internet; `localhost` and private addresses are refused. Use your public URL or a tunnel.

**No products for a password-protected store.** Development stores and stores before launch have a storefront password. If the Storefront API refuses tokenless requests for your store, create a Storefront public access token (Headless channel) and set `SHOPIFY_STOREFRONT_TOKEN`.

## Signed-in customers aren't recognized

1. "Identify signed-in customers" is on in the app embed.
2. `https://<store>/apps/replyze-chat/identity` in the browser, while signed in, answers `{"signed_in":true,...}`:
   - `401 bad_signature`: `SHOPIFY_CLIENT_SECRET` isn't this app's secret.
   - `403 wrong_store`: `SHOPIFY_STORE_DOMAIN` names another store.
   - `503`: `REPLYZE_IDENTITY_SECRET` isn't set.
   - a Shopify 404: the app proxy isn't deployed (`shopify app deploy`), or its subpath was changed in Shopify admin (match "App proxy path" in the embed).
3. Identity verification is on in Replyze (Settings → Chat Widget → Identity) and the secret is the same one.

## Knowledge sync

- `insufficient_scope`: the API key needs `knowledge:write`.
- `plan_required`: the workspace's plan doesn't include the REST API.
- "skipped: an article with this slug exists": you have an article with that slug that the sync didn't make. Rename its slug in Replyze, or leave it.

## Webhooks fail in the Dev Dashboard

The webhook URL is `<application_url>/webhooks`. A `401` means `SHOPIFY_CLIENT_SECRET` isn't this app's secret. Shopify waits 5 seconds at most.

## The demo

- `npm run demo` needs internet for `cdn.replyze.chat/widget.js`. To use a local widget build: `REPLYZE_WIDGET_SRC=http://localhost:5173/widget.js npm run demo`.
- Port in use: `DEMO_PORT=4400 npm run demo`.
- Live mode (`REPLYZE_WIDGET_TOKEN=wgt_...`): if Replyze lists allowed domains, add `localhost`.
