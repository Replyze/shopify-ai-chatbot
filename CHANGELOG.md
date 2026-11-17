# Changelog

## 0.1.0 (2026-11-17)

First version.

- **Theme app extension:** an app embed that loads the Replyze widget, with theme editor settings, the Customer Privacy API consent and optional signed-in customer identity.
- **Service** (Node, no runtime dependencies):
  - setup page;
  - live product lookup for Replyze Live data, from the Storefront API without a token;
  - app proxy identity (Shopify-signed customer id to Replyze `user_hash`);
  - HMAC-verified webhooks.
- **`npm run sync:knowledge`:** copies store policies and pages into the Replyze knowledge base.
- **Local demo:** a fictional store with the real widget and a scripted, labeled stand-in API.
- **Tests:**
  - unit tests;
  - Shopify theme check;
  - end-to-end tests with the real widget (guest chat, product cards, handoff, axe, mobile);
  - CI and a Dockerfile.
