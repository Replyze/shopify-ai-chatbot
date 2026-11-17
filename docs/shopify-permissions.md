# Shopify permissions and data

The app asks Shopify for as little as possible. Checked against shopify.dev on 2026-11-17.

## Access scopes

```toml
[access_scopes]
scopes = "write_app_proxy"
```

`write_app_proxy` is only for the app proxy that signs a signed-in customer's id ([installation](installation.md#4-signed-in-customers)). If you don't use that, you can remove the scope and the `[app_proxy]` block.

There is no `read_products`, `read_customers` or `read_orders`, and no Admin API access token anywhere in the project:

- **Products, prices, availability**: the [Storefront API](https://shopify.dev/docs/api/storefront) with tokenless access, the same public data the online store shows. Product data is not protected customer data.
- **Policies and pages**: the Storefront API too (`shop.refundPolicy`, `pages`).
- **Signed-in customer**: only the id Shopify adds to app proxy requests (`logged_in_customer_id`), never a lookup of the customer.

So there is no store token to store, rotate, or leak, and nothing in storefront JavaScript can reach the Admin API.

## Customer data

- The service stores nothing: no database, no logs of payloads.
- **Guests** chat anonymously. Nothing identifies them to Replyze.
- **Signed-in customers**, only with "Identify signed-in customers" on: Replyze gets `gid://shopify/Customer/<id>` and a signature. With "Also send their name and email" on, the theme block also passes the name and email that Shopify's Liquid `customer` object holds for that signed-in customer. Both switches are off by default.
- **Orders** are not read. The AI can't look up an order, so it can't reveal one. Use the team handoff for order questions.
- **Analytics consent**: visitor tracking (page views for the Replyze visitors list) starts off and follows the shopper's consent from Shopify's [Customer Privacy API](https://shopify.dev/docs/api/customer-privacy). The chat itself works either way.

Shopify's [protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) rules cover API access to customers and orders. This app makes no such call. If you add one, you'll need that access approved for a public app.

## Webhooks

`POST /webhooks`, declared in `shopify.app.toml`:

- `app/uninstalled`;
- the three compliance topics every App Store app must answer: `customers/data_request`, `customers/redact`, `shop/redact`.

Each request's `X-Shopify-Hmac-SHA256` is checked (HMAC-SHA256 of the raw body with the client secret, compared in constant time) before anything is read; a wrong one gets `401`, as Shopify expects. Because the app keeps no data, the compliance topics are acknowledged and logged by topic and shop only.

## App proxy

`https://<store>/apps/replyze-chat/*` → `<service>/proxy/*`. Every request is signed by Shopify (`signature` over the sorted query parameters). The service refuses an unsigned or changed request, one older than ten minutes, or one for another store than `SHOPIFY_STORE_DOMAIN`. Shopify strips cookies from proxied requests.

## The app embed and the theme

- A theme app extension adds the chat; no theme file is edited, and turning the embed off removes it.
- The widget loads from `cdn.replyze.chat` with `async`, so it doesn't block the page. Shopify's theme check reports this as `RemoteAsset` (a warning): it is on purpose, so the store always runs Replyze's current widget.
- Liquid in the block: about 10 KB of Shopify's 100 KB limit.

## Distribution

The app is meant for **custom distribution**: one store, or the stores of one Plus organization, with no App Store review. Each developer or agency creates their own app from this code ([installation](installation.md)). Publishing it on the App Store would need Shopify's review and its requirements (listing, support, performance) on your side.

Replyze also makes its own Shopify app, which isn't on the App Store yet.
