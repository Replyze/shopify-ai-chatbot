/** The demo storefront's pages: plain HTML in the spirit of a Shopify theme, no framework. */
import { escapeHtml } from '../app/http.ts';
import { formatPrice, type DemoProduct } from '../app/services/products.ts';
import type { DemoStore } from './answers.ts';

export type DemoMode = { kind: 'demo' } | { kind: 'live'; tokenHint: string };

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Fashion: ['#e9dfd3', '#b7906a'],
  Home: ['#dfe7e1', '#5f8a74'],
  Electronics: ['#dde3ec', '#5a6f91'],
};

/** One simple drawing per product ({bg} is the background color, for cut-outs). */
const ICONS: Record<string, string> = {
  'linen-overshirt': '<path d="M60 38 l14-10 h12 c2 8 10 12 14 12 s12-4 14-12 h12 l14 10 l-10 18 l-10-5 v52 h-40 v-52 l-10 5 z"/>',
  'merino-crew-sweater': '<path d="M58 38 l16-11 h12 c2 6 8 9 14 9 s12-3 14-9 h12 l16 11 l6 54 h-14 l-6-36 v52 h-52 v-52 l-6 36 h-14 z"/>',
  'canvas-weekender-bag': '<path d="M64 58 v-8 a9 9 0 0 1 9-9 h14 a9 9 0 0 1 9 9 v8" fill="none" stroke-width="7"/><rect x="38" y="58" width="84" height="48" rx="12"/><rect x="74" y="72" width="12" height="8" rx="2" fill="{bg}" stroke="none"/>',
  'everyday-leather-belt': '<rect x="22" y="62" width="116" height="18" rx="9"/><rect x="56" y="55" width="28" height="32" rx="5" fill="none" stroke="{bg}" stroke-width="5"/><path d="M70 71 h22" stroke="{bg}" stroke-width="4"/>',
  'stoneware-mug-set': '<path d="M50 50 h50 v36 c0 10-8 18-18 18 h-14 c-10 0-18-8-18-18 z"/><path d="M100 60 h8 c6 0 10 4 10 10 s-4 10-10 10 h-8" fill="none" stroke-width="7"/>',
  'washed-linen-duvet-cover': '<rect x="32" y="66" width="96" height="30" rx="7"/><rect x="40" y="50" width="34" height="18" rx="6"/><path d="M36 96 v12 M124 96 v12" stroke-width="7"/>',
  'oak-serving-board': '<rect x="30" y="50" width="80" height="44" rx="12"/><rect x="106" y="63" width="26" height="18" rx="9"/><circle cx="123" cy="72" r="3.5" fill="{bg}" stroke="none"/>',
  'cedar-soy-candle': '<rect x="56" y="62" width="48" height="46" rx="9"/><path d="M80 34 c9 10 9 17 0 24 c-9-7-9-14 0-24 z"/><rect x="62" y="74" width="36" height="12" rx="3" fill="{bg}" stroke="none"/>',
  'wireless-earbuds-pro': '<path d="M54 86 v-12 a26 26 0 0 1 52 0 v12" fill="none" stroke-width="7"/><rect x="46" y="80" width="18" height="28" rx="7"/><rect x="96" y="80" width="18" height="28" rx="7"/>',
  'portable-bluetooth-speaker': '<rect x="42" y="46" width="76" height="62" rx="18"/><circle cx="80" cy="77" r="18" fill="{bg}" stroke="none"/><circle cx="80" cy="77" r="8"/>',
  'usb-c-charger-65w': '<path d="M68 58 v-16 M92 58 v-16" stroke-width="7"/><rect x="52" y="56" width="56" height="50" rx="12"/><rect x="72" y="84" width="16" height="6" rx="3" fill="{bg}" stroke="none"/>',
  'smart-led-desk-lamp': '<path d="M54 106 h52" stroke-width="8"/><path d="M80 106 v-34 l20-22" fill="none" stroke-width="6"/><path d="M92 40 l30 6 l-10 20 z"/>',
};

/** A product picture: the category's colors and a simple drawing (no photos, so nothing to license). */
export function productSvg(product: DemoProduct): string {
  const [bg, fg] = CATEGORY_COLORS[product.category] ?? ['#e5e7eb', '#6b7280'];
  const icon = (ICONS[product.handle] ?? '<circle cx="80" cy="70" r="24"/>').replaceAll('{bg}', bg);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 140" role="img" aria-label="${escapeHtml(product.title)}"><rect width="160" height="140" fill="${bg}"/><g fill="${fg}" stroke="${fg}" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 4)">${icon}</g></svg>`;
}

function banner(mode: DemoMode): string {
  return mode.kind === 'demo'
    ? `<div class="demo-banner" role="note"><strong>Demo mode.</strong> A fictional store. The chat is the real Replyze widget, answering from scripted sample data: no AI, no Replyze account.</div>`
    : `<div class="demo-banner live" role="note"><strong>Live mode.</strong> The chat is your Replyze workspace (widget ${escapeHtml(mode.tokenHint)}). Product data on this page is still the demo catalog.</div>`;
}

function layout(data: DemoStore, mode: DemoMode, title: string, main: string, embed: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(data.store.name)} (demo)</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${banner(mode)}
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="/">${escapeHtml(data.store.name)}</a>
    <nav aria-label="Main">
      <a href="/#fashion">Fashion</a>
      <a href="/#home">Home</a>
      <a href="/#electronics">Electronics</a>
      <a href="/pages/help">Help</a>
    </nav>
  </div>
</header>
<main id="main">
${main}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>${escapeHtml(data.store.name)} is a fictional store for the <a href="https://github.com/Replyze/shopify-ai-chatbot">shopify-ai-chatbot</a> demo. Nothing here is for sale.</p>
  </div>
</footer>
${embed}
</body>
</html>`;
}

function card(product: DemoProduct): string {
  return `<li class="product">
  <a href="/products/${product.handle}">
    <img src="/images/${product.handle}.svg" alt="" width="320" height="280" loading="lazy">
    <span class="product-title">${escapeHtml(product.title)}</span>
  </a>
  <span class="product-meta"><span class="price">${formatPrice(product.price, product.currency)}</span>${product.available ? '' : '<span class="badge">Sold out</span>'}</span>
</li>`;
}

export function homePage(data: DemoStore, mode: DemoMode, embed: string): string {
  const categories = ['Fashion', 'Home', 'Electronics'];
  const sections = categories
    .map((category) => {
      const items = data.products.filter((p) => p.category === category);
      return `<section class="wrap category" id="${category.toLowerCase()}" aria-labelledby="h-${category.toLowerCase()}">
  <h2 id="h-${category.toLowerCase()}">${category}</h2>
  <ul class="grid">${items.map(card).join('')}</ul>
</section>`;
    })
    .join('\n');
  return layout(
    data,
    mode,
    'Shop',
    `<section class="hero">
  <div class="wrap">
    <h1>${escapeHtml(data.store.tagline)}</h1>
    <p>Questions about an order, a size or delivery? Open the chat in the corner and ask.</p>
    <p class="hint">Try: <q>What is your return policy?</q> · <q>Do you have wireless earbuds?</q> · <q>Can I talk to a person?</q></p>
  </div>
</section>
${sections}`,
    embed,
  );
}

export function productPage(data: DemoStore, mode: DemoMode, embed: string, product: DemoProduct): string {
  return layout(
    data,
    mode,
    product.title,
    `<div class="wrap product-page">
  <img src="/images/${product.handle}.svg" alt="${escapeHtml(product.title)}" width="560" height="490">
  <div>
    <p class="crumb"><a href="/#${product.category.toLowerCase()}">${escapeHtml(product.category)}</a></p>
    <h1>${escapeHtml(product.title)}</h1>
    <p class="price big">${formatPrice(product.price, product.currency)}</p>
    <p>${escapeHtml(product.description)}</p>
    <p class="stock ${product.available ? 'in' : 'out'}">${product.available ? 'Available' : 'Sold out'}</p>
    <button type="button" class="buy" ${product.available ? '' : 'disabled'} aria-describedby="demo-note">Add to cart</button>
    <p id="demo-note" class="hint">Demo store: the cart doesn't do anything.</p>
  </div>
</div>`,
    embed,
  );
}

export function helpPage(data: DemoStore, mode: DemoMode, embed: string): string {
  const items = Object.values(data.policies)
    .map((p) => `<section class="policy"><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.body)}</p></section>`)
    .join('\n');
  return layout(data, mode, 'Help', `<div class="wrap narrow"><h1>Help</h1>${items}</div>`, embed);
}

export function notFoundPage(data: DemoStore, mode: DemoMode, embed: string): string {
  return layout(data, mode, 'Not found', `<div class="wrap narrow"><h1>Page not found</h1><p><a href="/">Back to the shop</a></p></div>`, embed);
}

export const STYLES = `
:root { --ink: #1c2321; --muted: #57605c; --paper: #faf8f5; --card: #ffffff; --line: #e7e2da; --accent: #1f5f4a; --accent-ink: #ffffff; --sand: #f1ebe2; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--paper); }
a { color: inherit; }
img { max-width: 100%; height: auto; display: block; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px; }
.narrow { max-width: 760px; padding-top: 32px; padding-bottom: 48px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 8px; z-index: 10; background: var(--card); padding: 8px 12px; border-radius: 6px; }
.demo-banner { background: #fff4d6; color: #4a3a07; border-bottom: 1px solid #f0dc9c; padding: 10px 16px; font-size: 14px; text-align: center; }
.demo-banner.live { background: #e3f1ea; color: #134232; border-color: #b9dccb; }
.site-header { background: var(--card); border-bottom: 1px solid var(--line); }
.header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; flex-wrap: wrap; }
.logo { font-weight: 700; font-size: 20px; letter-spacing: .2px; text-decoration: none; }
nav { display: flex; gap: 18px; flex-wrap: wrap; }
nav a { text-decoration: none; color: var(--muted); font-weight: 500; padding: 8px 0; }
nav a:hover, nav a:focus-visible { color: var(--ink); text-decoration: underline; }
.hero { background: var(--sand); padding: 56px 0 48px; }
.hero h1 { font-size: clamp(28px, 4.5vw, 44px); line-height: 1.15; margin: 0 0 12px; max-width: 760px; }
.hero p { margin: 0 0 8px; color: var(--muted); max-width: 640px; }
.hint { font-size: 14px; color: var(--muted); }
.category { padding-top: 40px; }
.category h2 { font-size: 22px; margin: 0 0 16px; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
.product { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.product a { text-decoration: none; display: flex; flex-direction: column; }
.product img { aspect-ratio: 8 / 7; width: 100%; object-fit: cover; }
.product-title { padding: 12px 14px 0; font-weight: 600; }
.product-meta { padding: 4px 14px 14px; display: flex; gap: 10px; align-items: center; }
.price { color: var(--ink); }
.badge { font-size: 12px; background: #f3e8e8; color: #7a2b2b; padding: 2px 8px; border-radius: 999px; }
.product-page { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; padding-top: 32px; padding-bottom: 48px; align-items: start; }
.product-page img { border-radius: 12px; border: 1px solid var(--line); }
.product-page h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.2; }
.crumb { margin: 0 0 4px; font-size: 14px; color: var(--muted); }
.big { font-size: 22px; font-weight: 600; }
.stock.in { color: #1f6b3a; font-weight: 600; } .stock.out { color: #8a2b2b; font-weight: 600; }
.buy { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 8px; padding: 12px 20px; font: inherit; font-weight: 600; cursor: pointer; }
.buy:disabled { background: #a7b2ad; cursor: not-allowed; }
.buy:focus-visible, a:focus-visible { outline: 3px solid #1f5f4a; outline-offset: 2px; }
.policy { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin: 16px 0; }
.policy h2 { margin: 0 0 6px; font-size: 18px; }
.policy p { margin: 0; }
.site-footer { margin-top: 56px; border-top: 1px solid var(--line); padding: 24px 0 96px; color: var(--muted); font-size: 14px; }
@media (max-width: 720px) {
  .product-page { grid-template-columns: 1fr; }
  .hero { padding: 36px 0 32px; }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
`;
