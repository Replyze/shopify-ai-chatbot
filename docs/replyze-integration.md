# Replyze integration

Everything here uses documented, public Replyze mechanisms. Nothing calls a private endpoint, and no Replyze backend code is in this repository.

| Piece | Replyze mechanism | Docs |
|---|---|---|
| Chat on the store | The widget: `window.ReplyzeConfig` + `https://cdn.replyze.chat/widget.js` | [Replyze/replyze](https://github.com/Replyze/replyze) |
| Look from the theme editor | `ReplyzeConfig.overrides`: `color`, `position`, `theme`, `bot_name`, `bot_avatar`, `welcome_message`, `show_greeting_teaser`, `auto_open_delay` | same |
| Consent | `ReplyzeConfig.tracking` and `Replyze.setTracking(allowed)` | same |
| Signed-in customers | `Replyze.identify({ user_id, user_hash })` with identity verification | [react-live-chat: Identity verification](https://github.com/Replyze/react-live-chat#identity-verification) |
| Store knowledge | REST API v1: `GET/POST /articles`, `GET/PATCH /articles/{id}` | [OpenAPI](https://client.replyze.chat/api/v1/openapi.json) |
| Live product answers | Live data: an HTTPS endpoint the AI calls with GET | Replyze: AI Agent → Live data |
| AI answers, handoff, inbox | Built into Replyze; nothing to call | |

## What needs a Replyze account

| Works locally without an account | Needs a Replyze account |
|---|---|
| The demo store with the real widget and scripted answers (`npm run demo`) | Real AI answers and the shared inbox |
| The product lookup on demo data (`/lookup/products`, `DEMO_MODE=true`) | Live data calling the lookup (a plan with Live data) |
| All tests | The knowledge sync (a plan with the REST API, or the trial) |
| | Identity verification for signed-in customers |

Plans: [replyze.chat/pricing](https://replyze.chat/pricing?utm_source=github&utm_medium=referral&utm_campaign=shopify-ai-chatbot&utm_content=docs).

## The widget

The app embed sets, before `widget.js` loads:

```js
window.ReplyzeConfig = {
  token: 'wgt_...',
  apiUrl: 'https://client.replyze.chat', // or what the page set first
  tracking: false,                       // until the Customer Privacy API says yes
  overrides: { color: '#1f5f4a' },       // only what the theme editor sets
};
```

Calls made before the widget has loaded (identify, reset) go into `window.Replyze._queue`, which the widget runs in order when it starts.

## Knowledge sync

`npm run sync:knowledge` (`scripts/sync-knowledge.ts`):

1. Reads policies and Online Store pages from the Storefront API.
2. Lists the workspace's articles and matches them by slug: `shopify-<policy handle>`, `shopify-page-<page handle>`.
3. Creates what is missing (tag `shopify-sync`, with an `Idempotency-Key`), updates what changed (compared as plain text), and sets back to draft a synced article whose page is gone. Nothing is deleted.
4. Never changes an article it didn't make: one of yours with the same slug is reported and skipped.

| Option | Effect |
|---|---|
| `--dry-run` | Show the plan, change nothing |
| `--draft` | Create new articles as drafts, to review in Replyze before the AI uses them |
| `--no-pages` / `--no-policies` | Only one kind |
| `--pages=faq,contact` | Only these page handles (Shopify's own `data-sharing-opt-out` page is skipped unless named) |

Each article ends with a "Source:" link to the page on the store. Edit the content in Shopify; an edit made in Replyze to a synced article is replaced on the next sync.

## Live product answers

`GET /lookup/products?q=<words>&limit=<1-10>` with `Authorization: Bearer <LOOKUP_API_KEY>`:

```json
{
  "checked_at": "2026-11-17T11:00:23.828Z",
  "source": "shopify-storefront",
  "query": "carbon snowboard",
  "products": [
    {
      "title": "The Carbon",
      "price": "$729.95",
      "availability": "available",
      "url": "https://checkout.hydrogen.shop/products/the-carbon",
      "description": "Experience the ultimate in performance with \"The Carbon\" snowboard…"
    }
  ]
}
```

(A real answer from Shopify's public Hydrogen demo store.)

- `availability` is Shopify's `availableForSale`: at least one variant can be bought now. It is not a stock count, and it is read at the moment of the question.
- The visitor's words become plain search terms (letters, digits, at most 8 words), so chat text can't turn into a different Shopify query.
- Up to 120 lookups a minute per address. Shopify trouble is answered as `502` with a message the AI can pass on.
- Column names avoid the words Replyze hides from the AI (like `email` or `token`), so all five reach it once ticked.

## Human handoff

Built into Replyze; this project only makes sure the chat is on the store. When a shopper asks for a person, or the AI can't help, the chat goes to the team's shared inbox, the AI stops answering, and the widget shows that a teammate is on the way. Outside business hours the widget says when the team is back and asks for an email. The demo shows the same widget behavior with a scripted reply.

## Limits

- **No order lookups:** the app doesn't read orders, on purpose. See [shopify-permissions.md](shopify-permissions.md).
- **No product cards:** products in AI answers come through Live data as text with links. The product cards in the demo come from the scripted stand-in, which uses the widget's card format.
