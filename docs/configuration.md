# Configuration

Settings live in three places. Each setting is in one of them only.

| Where | What |
|---|---|
| The theme editor (the app embed) | On or off, widget token, look on this store, signed-in customers |
| Replyze (the dashboard) | AI behavior, knowledge, team, business hours, handoff, everything else about the chat |
| This service (`.env`) | Store domain, keys and secrets for the lookup, the app proxy and the sync |

## Theme editor: the app embed

Online Store → Themes → Customize → App embeds → **Replyze chat**. Turning the embed off removes the chat from the store; nothing stays in the theme.

| Setting | Values | Effect |
|---|---|---|
| Widget token | `wgt_...` | Required. Without a valid token nothing is added to the page (the theme editor shows a reminder). |
| Chat color | color | The launcher, header and the shopper's bubbles. Text on it is white or dark, whichever reads better. |
| Position | Use Replyze setting, Bottom right, Bottom left | |
| Theme | Use Replyze setting, Light, Dark | |
| Assistant name | text | Shown in the header and on replies |
| Assistant photo | image | Square works best |
| Welcome message | text | The first message in a new chat |
| Show the welcome message next to the chat button | Use Replyze setting, Yes, No | |
| Open the chat by itself | Use Replyze setting, Never, after 5, 15, 30 or 60 seconds | |
| Identify signed-in customers | off (default) | See [installation.md](installation.md#4-signed-in-customers) |
| Also send their name and email to the chat | off (default) | Only with the switch above |
| App proxy path | `/apps/replyze-chat` | Change it only if you changed the app proxy in Shopify admin |

An empty field or "Use Replyze setting" keeps the value from Replyze. These are the overrides the Replyze widget accepts from a page (`ReplyzeConfig.overrides`); nothing else can be overridden from the theme.

Text from these settings reaches the page as HTML-escaped data attributes, never as JavaScript, so nothing typed into a setting can run as code.

## Replyze

Set in the Replyze dashboard, for every place the chat runs:

- **Knowledge**: the knowledge base (articles, website pages, files) the AI answers from. `npm run sync:knowledge` adds the store's policies and pages.
- **Live data**: AI Agent → Live data, for the product lookup.
- **Business hours**: Settings → Business Hours. Outside them the widget says when the team is back, and a handoff asks for an email.
- **Handoff**: the AI hands the chat to the team when a shopper asks for a person or when it can't help; the team answers from the shared inbox.
- **Widget**: Settings → Chat Widget (look, pre-chat form, allowed domains, identity verification).

## This service (`.env`)

Copy `env.example` to `.env`. The service checks every value at start, refuses to start on a wrong one and says which, and lists which routes are on.

| Variable | Required for | Notes |
|---|---|---|
| `PORT` | | Default 3000 |
| `PUBLIC_URL` | setup page | The service's https address. `shopify app dev` sets `APP_URL` instead |
| `TRUST_PROXY` | | `true` behind a reverse proxy (rate limits by `X-Forwarded-For`) |
| `DEMO_MODE` | | `true`: products come from `demo/data/store.json` |
| `SHOPIFY_STORE_DOMAIN` | lookup, sync | `your-store.myshopify.com`, not the custom domain |
| `SHOPIFY_API_VERSION` | | Default `2026-10` (quarterly versions only) |
| `SHOPIFY_STOREFRONT_TOKEN` | | Optional Storefront public access token; without it, tokenless access |
| `SHOPIFY_CLIENT_ID` | setup page link | Or `SHOPIFY_API_KEY` |
| `SHOPIFY_CLIENT_SECRET` | app proxy, webhooks | Or `SHOPIFY_API_SECRET` |
| `LOOKUP_API_KEY` | lookup | 32 characters or more |
| `REPLYZE_IDENTITY_SECRET` | app proxy | Settings → Chat Widget → Identity |
| `REPLYZE_API_KEY` | sync | Scope `knowledge:write`; starts with `rpz_` |
| `REPLYZE_API_URL` | | Default `https://client.replyze.chat/api/v1` |
| `REPLYZE_WIDGET_TOKEN` | demo live mode | Empty: scripted demo |
