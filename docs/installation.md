# Installation

This sets up the chat on a Shopify store in four parts. Do the first part alone if you only want the chat widget; each later part adds one capability.

| Part | What it adds | Needs |
|---|---|---|
| 1. App and app embed | The Replyze chat on every storefront page, turned on and off in the theme editor | A Shopify app (Shopify CLI), a Replyze widget token |
| 2. Store knowledge | The AI answers shipping, returns and other questions from the store's own policies and pages | A Replyze API key (`knowledge:write`) |
| 3. Live product answers | The AI checks price and availability while it chats | This service online over HTTPS, a Replyze plan with Live data |
| 4. Signed-in customers | The chat knows which customer is writing | This service, the app proxy, Replyze identity verification |

Want to see it first? `npm install && npm run demo` runs a demo store locally, without any account ([README](../README.md#local-demo)).

## Before you start

- Node.js 22.18 or newer (the service runs its TypeScript directly).
- A Shopify Partner account and a development store ([development-store.md](development-store.md)).
- Shopify CLI: `npm install -g @shopify/cli@latest`.
- A Replyze account: [sign up](https://client.replyze.chat/register?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=install).

```sh
git clone https://github.com/Replyze/shopify-ai-chatbot.git
cd shopify-ai-chatbot
npm install
cp env.example .env
```

## 1. The app and the app embed

1. **Host the service.** Shopify needs an app URL even for an app whose main part is a theme extension. Run the service anywhere that serves HTTPS: a small VPS, Fly.io, Render, Railway, or the included Dockerfile (`docker build -t shopify-ai-chatbot . && docker run -p 3000:3000 --env-file .env shopify-ai-chatbot`). Put its address in `PUBLIC_URL`. During development, `shopify app dev` runs it for you behind a tunnel.
2. **Create the app.** In the project folder:
   ```sh
   shopify app config link     # create a new app (or pick yours); fills client_id
   ```
   Then open `shopify.app.toml`, compare it with git (the CLI can rewrite it with defaults), and replace `https://replyze-chat.example.com` with your `PUBLIC_URL`.
3. **Release it:**
   ```sh
   shopify app deploy          # the configuration, the app proxy and the theme app extension
   ```
4. **Install it on your development store** from the Dev Dashboard (your app → Install app), or with `shopify app dev`, which also previews the extension. The app asks for one permission, `write_app_proxy` ([why](shopify-permissions.md)).
5. **Copy the client id and secret** from the Dev Dashboard (app → Settings) into `.env` as `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`. Restart the service. When Shopify opens the app (after install, or from Apps in admin), the setup page shows a button straight to the app embed in the theme editor.
6. **Turn on the app embed.** Online Store → Themes → Customize → App embeds → **Replyze chat**. Paste your widget token (`wgt_...`) from Replyze: Settings → Integrations → Install widget. Save.
7. **Allowed domains.** If Replyze lists allowed domains for the widget (Settings → Chat Widget), add the store's domains: `your-store.myshopify.com` and the custom domain. With no allowed domains the widget loads anywhere.

Open the store: the chat button is in the corner. Its look comes from Replyze; anything you set in the app embed (color, position, texts) wins on this store ([configuration.md](configuration.md#theme-editor-the-app-embed)).

## 2. Store knowledge

Copies the store's policies (shipping, refund, privacy, terms, subscription) and Online Store pages into the Replyze knowledge base, which the AI answers from.

1. In Replyze, Settings → Integrations → Developer: create an API key with the `knowledge:write` scope. Put it in `.env` as `REPLYZE_API_KEY`, and the store's `your-store.myshopify.com` domain as `SHOPIFY_STORE_DOMAIN`.
2. See what would change, then sync:
   ```sh
   npm run sync:knowledge -- --dry-run
   npm run sync:knowledge
   ```
3. Run it again after you change a policy or page, or on a schedule (`cron`, a scheduled CI job). Unchanged articles are left alone.

Options and the rules it follows are in [replyze-integration.md](replyze-integration.md#knowledge-sync).

## 3. Live product answers

Replyze's **Live data** lets the AI look something up in your own system while it chats. This service is that system for the store's products: it reads the Storefront API at the moment of the question.

1. Generate a key and put it in `.env` as `LOOKUP_API_KEY`:
   ```sh
   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
   ```
   Set `SHOPIFY_STORE_DOMAIN`, restart, and check it:
   ```sh
   curl -H "Authorization: Bearer $LOOKUP_API_KEY" "$PUBLIC_URL/lookup/products?q=linen+shirt"
   ```
2. In Replyze, AI Agent → Live data → Connect your data → **Your own endpoint**:
   - Base URL: `https://<your service>/lookup`
   - Header: `Authorization` = `Bearer <LOOKUP_API_KEY>`
3. Add a lookup:
   - Name: `Products`
   - When should the AI use it: *When a visitor asks about a product: whether it is in stock, its price, what it is like, or for a link.*
   - Path: `/products?q={product}`, with one value `product` (text): *the product the visitor is asking about, in a few words*.
   - Where the rows are: `products`
   - Run it with an example, tick `title`, `price`, `availability`, `url` and `description`, and save.

Live data is part of some Replyze plans ([pricing](https://replyze.chat/pricing?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=install)). Replyze calls the endpoint over HTTPS from the internet, so `localhost` won't work; for a local test use a tunnel (`shopify app dev` makes one).

## 4. Signed-in customers

When a customer is signed in to the store, the chat can know who they are, so the team sees it in the inbox and the conversation follows them.

1. In Replyze, Settings → Chat Widget → Identity: turn on identity verification and copy the secret into `.env` as `REPLYZE_IDENTITY_SECRET`. Restart.
2. In the app embed, turn on **Identify signed-in customers**. Leave **Also send their name and email** off unless you want them in the chat ([privacy](shopify-permissions.md#customer-data)).

How it works: the block asks `https://<store>/apps/replyze-chat/identity`. Shopify forwards that to `<service>/proxy/identity` with the signed-in customer's id and a signature made with your app secret. The service checks the signature and answers the customer's Replyze `user_id` and `user_hash`, which the widget sends to Replyze. A browser can't fake it, because it never sees the secret.

Next: [configuration.md](configuration.md) · [troubleshooting.md](troubleshooting.md)
