/**
 * Makes the README images from the running demo (real widget.js, scripted
 * answers): assets/demo-desktop.png, assets/demo-mobile.png,
 * assets/setup-page.png and the banner assets/hero.png.
 *
 *   npx playwright install chromium   # once
 *   npm run screenshots
 */
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { loadConfig } from '../app/config.ts';
import { createApp } from '../app/server.ts';
import { createDemoServer } from '../demo/server.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const assets = `${root}assets`;
mkdirSync(assets, { recursive: true });

const DEMO_PORT = 4305;
const { server } = await createDemoServer({ port: DEMO_PORT, replyDelayMs: 300 });
await new Promise<void>((resolve) => server.listen(DEMO_PORT, resolve));

const { config } = loadConfig({
  SHOPIFY_CLIENT_SECRET: 'screenshot-secret',
  SHOPIFY_CLIENT_ID: 'your-client-id',
  LOOKUP_API_KEY: 'screenshot-lookup-key-0000000000000000',
  SHOPIFY_STORE_DOMAIN: 'harbor-and-pine.myshopify.com',
  PUBLIC_URL: 'https://replyze-chat.example.com',
});
const app = createApp(config);
await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
const appPort = (app.address() as AddressInfo).port;

const browser = await chromium.launch();

async function chat(page: Page, questions: string[], expectLast: string) {
  await page.goto(`http://localhost:${DEMO_PORT}/`);
  const widget = page.locator('#aichat-widget');
  await widget.getByRole('button', { name: 'Open chat' }).click();
  const input = widget.getByPlaceholder('Type a message...');
  for (const question of questions) {
    await input.fill(question);
    await input.press('Enter');
    await page.waitForTimeout(900);
  }
  await widget.getByText(expectLast).first().waitFor();
  await page.waitForTimeout(700);
}

try {
  // Desktop: a policy answer, then a product card.
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await chat(desktop, ['What is your return policy?', 'Do you have wireless earbuds?'], 'Wireless Earbuds Pro');
  await desktop.screenshot({ path: `${assets}/demo-desktop.png` });

  // Mobile: delivery times, then asking for a person.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await chat(mobile, ['How long does delivery take?', 'Can I talk to a person?'], 'Waiting for a teammate');
  await mobile.screenshot({ path: `${assets}/demo-mobile.png` });

  // The app's home page as Shopify opens it after install (signed like Shopify signs it).
  const params = new URLSearchParams({ shop: 'harbor-and-pine.myshopify.com', timestamp: String(Math.floor(Date.now() / 1000)) });
  const message = [...params].map(([k, v]) => `${k}=${v}`).sort().join('&');
  params.set('hmac', createHmac('sha256', 'screenshot-secret').update(message).digest('hex'));
  const setup = await browser.newPage({ viewport: { width: 900, height: 900 }, colorScheme: 'light' });
  await setup.goto(`http://127.0.0.1:${appPort}/?${params}`);
  await setup.screenshot({ path: `${assets}/setup-page.png`, fullPage: true });

  // Banner: the Replyze look (dark, #1eabd2) with the desktop screenshot.
  let logo = '';
  try {
    const response = await fetch('https://raw.githubusercontent.com/Replyze/.github/main/assets/logo-on-dark.png');
    if (response.ok) logo = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  } catch {
    /* text logo below */
  }
  const shot = `data:image/png;base64,${readFileSync(`${assets}/demo-desktop.png`).toString('base64')}`;
  const hero = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await hero.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 640px; background: #0b0f17; font-family: "Segoe UI", system-ui, sans-serif; color: #f1f5f9; position: relative; overflow: hidden; }
    .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: #1eabd2; }
    .text { position: absolute; left: 88px; top: 70px; width: 520px; }
    .logo img { height: 52px; }
    .logo span { font-weight: 800; font-size: 34px; letter-spacing: 1px; }
    h1 { font-size: 60px; line-height: 1.05; margin-top: 70px; font-weight: 700; }
    p { margin-top: 22px; font-size: 25px; line-height: 1.4; color: #94a3b8; }
    .tags { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 10px; }
    .tags span { border: 1px solid #1f2a3a; background: #111a28; color: #7dd3ea; border-radius: 8px; padding: 6px 12px; font-size: 17px; }
    .shot { position: absolute; left: 640px; top: 58px; width: 760px; border-radius: 14px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.55); border: 1px solid #1f2a3a; }
    .shot img { display: block; width: 100%; }
    .url { position: absolute; left: 88px; bottom: 42px; font-size: 22px; color: #94a3b8; }
  </style></head><body>
    <div class="bar"></div>
    <div class="text">
      <div class="logo">${logo ? `<img src="${logo}" alt="Replyze">` : '<span>REPLYZE</span>'}</div>
      <h1>Shopify AI Chatbot</h1>
      <p>Open-source storefront chat for Shopify: store FAQs, live product answers and handoff to your team.</p>
      <div class="tags"><span>Theme app extension</span><span>Storefront API</span><span>TypeScript</span></div>
    </div>
    <div class="shot"><img src="${shot}" alt=""></div>
    <div class="url">github.com/Replyze/shopify-ai-chatbot</div>
  </body></html>`);
  await hero.waitForTimeout(300);
  await hero.screenshot({ path: `${assets}/hero.png` });

  writeFileSync(`${assets}/README.md`, 'Images in the README, made with `npm run screenshots` from the local demo (real Replyze widget, scripted answers).\n');
  console.log('Wrote assets/hero.png, demo-desktop.png, demo-mobile.png, setup-page.png');
} finally {
  await browser.close();
  server.close();
  app.close();
}
