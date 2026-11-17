# Contributing

Thanks for helping. The general rules for Replyze repositories (conduct, support, security) are in [Replyze/.github](https://github.com/Replyze/.github); this file is how to work on this one.

## Set up

```sh
npm install
npx playwright install chromium
npm run demo            # http://localhost:4300
```

## Before a pull request

```sh
npm run typecheck
npm test
npm run check:extension
npm run test:e2e
```

All four run in CI.

## Ground rules

- **No new runtime dependencies** in `app/`. It runs on Node's standard library; dev dependencies are fine.
- **Only documented APIs.** Shopify: current GraphQL APIs and the theme app extension rules. Replyze: the widget's public JavaScript API, the REST API v1 ([OpenAPI](https://client.replyze.chat/api/v1/openapi.json)) and Live data.
- **Least privilege.** A change that needs a new Shopify scope or customer data must say why in the pull request and in `docs/shopify-permissions.md`.
- **The demo stays honest.** Scripted answers are labeled as scripted; demo data is fictional.
- **Tests with the change.** Signature checks, routes and the Liquid block have tests; keep it that way.
- Plain, short English in docs and messages.
