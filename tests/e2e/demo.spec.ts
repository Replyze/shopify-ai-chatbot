/**
 * The demo store in a browser with the real Replyze widget: a guest asks
 * store questions, gets product cards, asks for a person; plus the page's
 * accessibility and layout on desktop and mobile.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const widget = (page: Page) => page.locator('#aichat-widget');

async function openChat(page: Page) {
  await page.goto('/');
  await expect(widget(page).getByRole('button', { name: 'Open chat' })).toBeVisible();
  await widget(page).getByRole('button', { name: 'Open chat' }).click();
  await expect(widget(page).getByPlaceholder('Type a message...')).toBeVisible();
}

async function ask(page: Page, text: string) {
  const input = widget(page).getByPlaceholder('Type a message...');
  await input.fill(text);
  await input.press('Enter');
}

test('the app embed sets up the widget with the token and the theme editor settings', async ({ page }) => {
  await page.goto('/');
  const config = await page.evaluate(() => (window as unknown as { ReplyzeConfig: Record<string, unknown> }).ReplyzeConfig);
  expect(config).toMatchObject({ token: 'wgt_demo_harbor_and_pine', overrides: { color: '#1f5f4a' } });
  await expect(page.locator('script[src="https://cdn.replyze.chat/widget.js"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { Replyze?: { _initialized?: boolean } }).Replyze?._initialized)).toBe(true);
});

test('says plainly that this is a demo with scripted answers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('scripted sample data: no AI, no Replyze account');
  await widget(page).getByRole('button', { name: 'Open chat' }).click();
  await expect(widget(page)).toContainText('Harbor & Pine demo');
});

test('a guest asks about returns and gets the store\'s answer', async ({ page }) => {
  await openChat(page);
  await ask(page, 'What is your return policy?');
  await expect(widget(page)).toContainText('You can return unused items within 30 days of delivery.');
});

test('a product question shows a product card with price and stock', async ({ page }) => {
  await openChat(page);
  await ask(page, 'Do you have wireless earbuds?');
  await expect(widget(page)).toContainText('Yes, the Wireless Earbuds Pro is available for $129.00.');
  const card = widget(page).getByRole('link', { name: /View product/ }).first();
  await expect(card).toHaveAttribute('href', /\/products\/wireless-earbuds-pro$/);
  await expect(widget(page)).toContainText('In stock');
});

test('a sold-out product is reported as sold out', async ({ page }) => {
  await openChat(page);
  await ask(page, 'Is the oak serving board in stock?');
  await expect(widget(page)).toContainText('is sold out right now');
  await expect(widget(page)).toContainText('Sold out');
});

test('asking for a person hands the chat to the team', async ({ page }) => {
  await openChat(page);
  await ask(page, 'Can I talk to a person?');
  await expect(widget(page)).toContainText('In this demo nobody is on the other side');
  await expect(widget(page)).toContainText('Waiting for a teammate');
});

test('two quick questions both get their answers', async ({ page }) => {
  await openChat(page);
  await ask(page, 'How long does delivery take?');
  await ask(page, 'What are your business hours?');
  await expect(widget(page)).toContainText('Standard delivery takes 3 to 5 business days');
  await expect(widget(page)).toContainText('Monday to Friday, 9 am to 5 pm Pacific time');
});

test('the conversation is still there after a reload', async ({ page }) => {
  await openChat(page);
  await ask(page, 'What are your business hours?');
  await expect(widget(page)).toContainText('Monday to Friday, 9 am to 5 pm Pacific time');
  await page.reload();
  await widget(page).getByRole('button', { name: 'Open chat' }).click();
  await expect(widget(page)).toContainText('What are your business hours?');
});

for (const path of ['/', '/products/linen-overshirt', '/pages/help']) {
  test(`the store page ${path} has no accessibility violations (axe, WCAG 2.2 AA)`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      // The widget is Replyze's: it has its own checks (see the widget test below).
      .exclude('#aichat-widget')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

/**
 * Known in the Replyze widget itself (not this repo), reported to Replyze:
 * the light grey message time, date separator and "Powered by Replyze" text
 * are below 4.5:1 contrast. Anything else serious fails the test.
 */
const KNOWN_WIDGET_ISSUES = ['.aichat-message-time', '.aichat-date-separator', '.aichat-powered-label', '.aichat-powered-name'];

test('the open chat widget has no serious accessibility violations beyond the known ones', async ({ page }) => {
  await openChat(page);
  await ask(page, 'Do you have wireless earbuds?');
  await expect(widget(page)).toContainText('Wireless Earbuds Pro');
  const results = await new AxeBuilder({ page }).include('#aichat-widget').withTags(['wcag2a', 'wcag2aa']).analyze();
  const unexpected = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) =>
      v.nodes
        .filter((n) => !(v.id === 'color-contrast' && KNOWN_WIDGET_ISSUES.some((selector) => JSON.stringify(n.target).includes(selector))))
        .map((n) => `${v.id} at ${JSON.stringify(n.target)}`),
    );
  expect(unexpected).toEqual([]);
});

test('no horizontal scrolling, and the open chat fits the screen', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const launcher = widget(page).getByRole('button', { name: 'Open chat' });
  const box = await launcher.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

  await launcher.click();
  const input = widget(page).getByPlaceholder('Type a message...');
  await expect(input).toBeVisible();
  const inputBox = await input.boundingBox();
  expect(inputBox!.x).toBeGreaterThanOrEqual(0);
  expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(viewport.width);
  expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(viewport.height);
});

test('the store works when the widget can\'t load', async ({ page }) => {
  await page.route('https://cdn.replyze.chat/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Linen Overshirt' }).click();
  await expect(page.getByRole('heading', { name: 'Linen Overshirt' })).toBeVisible();
});
