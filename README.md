<p align="center">
  <a href="https://replyze.chat/?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Replyze/.github/main/assets/logo-on-dark.png">
      <img src="https://raw.githubusercontent.com/Replyze/.github/main/assets/logo-on-light.png" alt="Replyze" height="48">
    </picture>
  </a>
</p>

# Shopify AI chatbot

*Add AI-assisted customer support, store FAQs and live chat to Shopify with a developer-friendly starter.*

<p align="center"><img src="assets/hero.png" alt="Shopify AI chatbot: the chat widget answering a product question on a demo store" width="880"></p>

An open-source Shopify AI chatbot integration for developers and agencies. It adds a storefront chat widget to a Shopify store through a theme app extension, answers store FAQs from the store's own policies and pages, checks products, prices and availability live from the Storefront API, and hands conversations to a human team. The chat itself is [Replyze](https://replyze.chat/?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot)'s widget; this repository is the Shopify side, in TypeScript, with no runtime dependencies and no Admin API token.

**[Create a free account](https://client.replyze.chat/register?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=cta-top)** · [Live demo](https://replyze.chat/?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=live-demo) · [Docs](docs/installation.md)

Replyze's own Shopify app isn't on the Shopify App Store yet. Until it is, this starter is the way to put Replyze on a Shopify store with an app embed instead of pasting a snippet into the theme, and it stays useful afterwards if you want to own and extend the integration.

## Quickstart: the local demo

1. `git clone https://github.com/Replyze/shopify-ai-chatbot.git && cd shopify-ai-chatbot && npm install`
2. `npm run demo`
3. Open http://localhost:4300 and ask the chat *"What is your return policy?"*, *"Do you have wireless earbuds?"* or *"Can I talk to a person?"*.

No account, no API key, no Shopify store. Node.js 22.18 or newer.

<table>
  <tr>
    <td width="68%"><img src="assets/demo-desktop.png" alt="Demo store on desktop: the chat answers the return policy and shows a product card for Wireless Earbuds Pro, $129.00, in stock"></td>
    <td width="32%"><img src="assets/demo-mobile.png" alt="Demo store on a phone: the chat answers delivery times, then hands the chat to the team and shows Waiting for a teammate"></td>
  </tr>
</table>

## Features

- **Storefront chat widget, installed as an app embed.** A theme app extension: merchants turn it on or off in the theme editor, and no theme file is edited. It loads `async`, so it doesn't block the page, and the store keeps working if it can't load. Tested on desktop and phone layouts and with axe.
- **Theme-aware settings.** Color, position, light or dark, assistant name and photo, welcome message, teaser and auto-open, set per store in the theme editor; anything left empty keeps the Replyze setting.
- **AI answers to store FAQs.** `npm run sync:knowledge` copies the store's shipping, refund, privacy and terms policies and its pages into the Replyze knowledge base, and keeps them in step: only changed articles are updated, removed ones go back to draft, and articles you wrote are never touched.
- **Live product answers.** A Replyze Live data source calls `GET /lookup/products`, which asks the store's Storefront API at that moment: title, price, availability, a short description and the link.
- **Human handoff.** When a shopper asks for a person or the AI can't help, the chat goes to the team's shared inbox in Replyze and the widget shows that a teammate is on the way.
- **Guests and signed-in customers.** Guests chat without logging in. Optionally, signed-in customers are identified through a Shopify-signed app proxy request and Replyze identity verification, so a browser can't pretend to be someone else.
- **Privacy by default.** One Shopify scope (`write_app_proxy`), no access to customers or orders, no database. Visitor tracking follows Shopify's Customer Privacy API consent.
- **A demo that runs the real widget.** The demo store loads the real `widget.js` against a local, scripted stand-in for the Replyze API, clearly labeled, with deterministic answers.

## Local demo

`npm run demo` starts **Harbor & Pine**, a fictional store with fashion, home goods and electronics.

- **Demo mode** (default): the chat is the real Replyze widget from `cdn.replyze.chat`, answering from scripted rules over [`demo/data/store.json`](demo/data/store.json). It is not AI, and the page, the assistant's name and its first message say so. Same question, same answer, every time.
- **Live mode**: `REPLYZE_WIDGET_TOKEN=wgt_... npm run demo` connects the same page to your Replyze workspace, with real AI answers from your knowledge base. If your widget lists allowed domains, add `localhost`.

The demo also serves the product lookup on the demo catalog:

```sh
curl -H "Authorization: Bearer demo-lookup-key-not-a-secret-0000000000" "http://localhost:4300/lookup/products?q=earbuds"
```

## Architecture

```mermaid
flowchart LR
  shopper["Shopper on the store"] --> embed["App embed<br/>(theme app extension)"]
  embed -->|loads| widget["Replyze widget<br/>cdn.replyze.chat"]
  widget <--> replyze[("Replyze<br/>AI agent · inbox · knowledge")]
  replyze -->|"Live data: GET /lookup/products"| service["This service<br/>(app/)"]
  service -->|"Storefront API, tokenless"| shopify[("Shopify store")]
  embed -->|"/apps/replyze-chat/identity<br/>(app proxy, signed by Shopify)"| service
  sync["npm run sync:knowledge"] -->|"policies, pages"| shopify
  sync -->|"REST API: articles"| replyze
```

| Path | What |
|---|---|
| [`extensions/replyze-chat-embed/`](extensions/replyze-chat-embed/) | The theme app extension: one app embed block |
| [`app/`](app/) | The service (Node, `node:http`, no dependencies): setup page, product lookup, app proxy identity, webhooks |
| [`app/services/`](app/services/) | Storefront API client, product sources, Shopify signature checks, Replyze identity and REST client, knowledge sync |
| [`scripts/`](scripts/) | `sync-knowledge`, `check-extension` (Shopify theme check + size limits), `screenshots` |
| [`demo/`](demo/) | The demo store, its catalog and the scripted stand-in API |
| [`tests/`](tests/) | Unit tests (Vitest) and end-to-end tests with the real widget (Playwright) |
| `shopify.app.toml`, `shopify.web.toml` | App configuration for Shopify CLI |

Node 22.18+ runs the TypeScript directly (type stripping), so there is no build step. `Dockerfile` makes a small image with only `app/`.

## Installation

The full guide is in [docs/installation.md](docs/installation.md). In short:

1. Host the service (any HTTPS host, or the Dockerfile) and set `PUBLIC_URL`.
2. `shopify app config link`, set your URL in `shopify.app.toml`, `shopify app deploy`, and install the app on your store.
3. In the theme editor, App embeds → **Replyze chat**: paste your widget token from Replyze (Settings → Integrations → Install widget).

Then add what you need: store knowledge, live product answers, signed-in customers. A development store guide is in [docs/development-store.md](docs/development-store.md).

## Shopify configuration

- **Scopes:** `write_app_proxy` only, for the signed customer id. Products, prices, pages and policies come from the Storefront API without a token. No `read_products`, `read_customers` or `read_orders`.
- **API version:** `2026-10` (GraphQL; the REST Admin API isn't used).
- **App embed settings:** see [docs/configuration.md](docs/configuration.md#theme-editor-the-app-embed).
- **Webhooks:** `app/uninstalled` and the three compliance topics, HMAC-verified.
- **Distribution:** custom distribution (your store, or one Plus organization). Details: [docs/shopify-permissions.md](docs/shopify-permissions.md).

## Replyze integration

Only documented Replyze mechanisms: the widget embed and its JavaScript API, identity verification, the REST API v1 (knowledge base articles) and Live data. No private endpoints, no Replyze backend code. What works locally and what needs an account: [docs/replyze-integration.md](docs/replyze-integration.md#what-needs-a-replyze-account).

## AI FAQ setup

1. In Replyze, create an API key with `knowledge:write` (Settings → Integrations → Developer).
2. In `.env`: `SHOPIFY_STORE_DOMAIN=your-store.myshopify.com` and `REPLYZE_API_KEY=rpz_live_...`.
3. `npm run sync:knowledge -- --dry-run`, then `npm run sync:knowledge`.

The AI then answers "What are your shipping options?", "How long does delivery take?", "What is your return policy?" and "How can I contact support?" from the store's own text, as far as the store's policies and pages say it. For "What are your business hours?", write them on a store page (the sync copies it) or in a Replyze article; Replyze's Settings → Business Hours drive the widget's "back at" notice and the handoff messages, not the AI's answer. The AI answers from what is in the knowledge base; anything else goes to the team.

## Product information setup

1. Set `LOOKUP_API_KEY` (32+ characters) and `SHOPIFY_STORE_DOMAIN`, and check `GET /lookup/products?q=...`.
2. In Replyze, AI Agent → Live data: an API source with base URL `https://<service>/lookup` and header `Authorization: Bearer <key>`, then a lookup with path `/products?q={product}` and rows at `products`.

The answer is read from the Storefront API at the moment of the question. "Available" means Shopify's `availableForSale` (at least one variant can be bought now), not a stock count. Step by step: [docs/installation.md](docs/installation.md#3-live-product-answers).

## Human support handoff

Built into Replyze: a shopper who asks for a person, or a question the AI can't answer, goes to the team's shared inbox, and the AI stops answering in that chat. The widget shows "Waiting for a teammate", or, outside business hours, when the team is back, and asks for an email. Nothing to configure in this repository.

## Security and privacy

- No Admin API token exists in this project, and nothing in storefront JavaScript is secret: the widget token is public by design.
- Secrets (`SHOPIFY_CLIENT_SECRET`, `REPLYZE_IDENTITY_SECRET`, `LOOKUP_API_KEY`, `REPLYZE_API_KEY`) stay in the service's environment and are never printed.
- Webhooks and app proxy requests are verified with HMAC-SHA256 in constant time; app proxy requests must be fresh and for your store.
- The lookup needs a bearer key, takes plain search words only, answers public product facts only, and is rate limited.
- Text from theme settings reaches the page as HTML-escaped attributes, never as script.
- The service stores nothing and logs no payloads. Signed-in customers are identified by id only unless you turn on sharing name and email.

More: [docs/shopify-permissions.md](docs/shopify-permissions.md). Report a vulnerability privately through [GitHub security advisories](https://github.com/Replyze/shopify-ai-chatbot/security/advisories/new).

## Tests

```sh
npm run typecheck        # TypeScript, strict
npm test                 # unit tests: signatures (Shopify's documented vectors), routes, config, product sources, knowledge sync, demo, the Liquid block
npm run check:extension  # Shopify theme check (theme app extension rules) and Shopify's size limits
npx playwright install chromium && npm run test:e2e   # the demo with the real widget.js: guest chat, product cards, handoff, axe accessibility, mobile layout
```

CI runs all four, plus a Docker build that answers a lookup. No real credentials are used anywhere.

## Troubleshooting

[docs/troubleshooting.md](docs/troubleshooting.md): the chat doesn't show, lookup errors, signed-in customers, knowledge sync, the demo.

## Want hosted AI support and a shared inbox?

This repository connects a store; the support itself runs in Replyze. With a Replyze account you get:

- an AI agent that answers from your knowledge base and the website pages it learned, and hands chats to your team;
- a shared inbox for web chat, email, WhatsApp and Telegram (Messenger and Instagram are in beta);
- Live data lookups, identity verification and a REST API, as used here.

[Create a free account](https://client.replyze.chat/register?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=hosted-support) · [Pricing](https://replyze.chat/pricing?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=hosted-support)

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Ideas that fit: more storefront features in the app embed, other product sources, a scheduled knowledge sync.

## License

[MIT](LICENSE). Shopify is a trademark of Shopify Inc.; this project is not affiliated with or endorsed by Shopify.
