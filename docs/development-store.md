# A development store to try it on

1. **Partner account.** Sign up at [partners.shopify.com](https://partners.shopify.com). Apps and development stores are managed in the [Dev Dashboard](https://dev.shopify.com).
2. **Development store.** Dev Dashboard → Stores → Add store → development store. Development stores are free and can install apps that aren't on the App Store.
3. **Sample content.** Add a few products, a shipping and a refund policy (Settings → Policies), and an FAQ page (Online Store → Pages). The knowledge sync reads policies and pages; the product lookup reads products.
4. **Storefront password.** Development stores have one: enter it to see the store. If the Storefront API refuses tokenless requests while the password is on, set `SHOPIFY_STOREFRONT_TOKEN` ([troubleshooting](troubleshooting.md#the-product-lookup-answers)).
5. **The app.** Follow [installation.md](installation.md). `shopify app dev` picks the development store, runs the service behind a tunnel, and previews the theme extension without a deploy.

To test the product lookup without a store at all, use the demo catalog (`DEMO_MODE=true`) or Shopify's public Hydrogen demo store:

```sh
SHOPIFY_STORE_DOMAIN=hydrogen-preview.myshopify.com LOOKUP_API_KEY=$(node -e "console.log(crypto.randomBytes(32).toString('hex'))") npm start
```
