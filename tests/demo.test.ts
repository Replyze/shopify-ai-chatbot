/** Demo mode: scripted answers and the stand-in API the real widget talks to. */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { answerFor } from '../demo/answers.ts';
import { createFakeReplyzeApi, DEMO_BOT_NAME } from '../demo/fakeReplyzeApi.ts';
import { loadDemoStore } from '../demo/server.ts';

const data = loadDemoStore();
const BASE = 'http://localhost:4300';

describe('answerFor', () => {
  const cases: Array<[string, string]> = [
    ['What are your shipping options?', 'shipping'],
    ['How long does delivery take?', 'delivery'],
    ['What is your return policy?', 'returns'],
    ['Can I get a refund?', 'returns'],
    ['How can I contact support?', 'contact'],
    ['What are your business hours?', 'hours'],
    ['Can I talk to a person?', 'handoff'],
    ['hello!', 'greeting'],
    ['Do you have wireless earbuds?', 'product'],
    ['Is the oak serving board in stock?', 'product'],
    ['What do you sell?', 'browse'],
    ['Tell me a joke', 'fallback'],
  ];
  it.each(cases)('%s → %s', (question, intent) => {
    expect(answerFor(question, data, BASE).intent).toBe(intent);
  });

  it('answers from the demo data and says it is demo data', () => {
    expect(answerFor('What is your return policy?', data, BASE).content).toBe(data.policies.returns.summary);
    const product = answerFor('Is the oak serving board in stock?', data, BASE);
    expect(product.content).toBe('The Oak Serving Board ($54.00) is sold out right now. (Demo prices and stock.)');
    expect(product.cards?.[0]).toEqual({
      title: 'Oak Serving Board',
      description: 'Home',
      image_url: `${BASE}/images/oak-serving-board.svg`,
      url: `${BASE}/products/oak-serving-board`,
      price: '$54.00',
      in_stock: false,
    });
  });

  it('hands off, and says no one is on the other side in the demo', () => {
    const answer = answerFor('I want to speak to a human', data, BASE);
    expect(answer.handoff).toBe(true);
    expect(answer.content).toContain('In this demo nobody is on the other side');
  });

  it('is the same every time', () => {
    expect(answerFor('Do you have mugs?', data, BASE)).toEqual(answerFor('Do you have mugs?', data, BASE));
  });
});

describe('the demo\'s stand-in Replyze API', () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function start(now: () => number) {
    const api = createFakeReplyzeApi({ token: 'wgt_demo', data, baseUrl: BASE, replyDelayMs: 500, now });
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (!(await api(req, res, url))) {
        res.writeHead(418);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    close = () => new Promise((resolve) => server.close(() => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/w/wgt_demo`;
  }

  const post = (url: string, body: unknown) => fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }).then((r) => r.json());

  it('runs a guest chat: session, message, a reply after the typing pause, handoff', async () => {
    let clock = 1_000_000;
    const api = await start(() => clock);

    const config = await fetch(`${api}/config`).then((r) => r.json());
    expect(config.widget.bot_name).toBe(DEMO_BOT_NAME);
    expect(config.ws).toBeNull();

    const session = await post(`${api}/session/start`, { metadata: {} });
    expect(session.session_id).toBe('0');

    const sent = await post(`${api}/message`, { session_id: '0', content: 'What is your return policy?', contact_id: session.contact_id });
    expect(sent.ai_replying).toBe(true);
    expect(sent.message).toMatchObject({ sender: 'visitor', content: 'What is your return policy?' });

    const early = await fetch(`${api}/messages?session_id=${sent.session_id}&after_id=${sent.message.id}`).then((r) => r.json());
    expect(early.messages).toEqual([]);
    clock += 600;
    const later = await fetch(`${api}/messages?session_id=${sent.session_id}&after_id=${sent.message.id}`).then((r) => r.json());
    expect(later.messages).toHaveLength(1);
    expect(later.messages[0]).toMatchObject({ sender: 'bot', ai: false, content: data.policies.returns.summary });
    expect(later.waiting_for_team).toBe(false);

    await post(`${api}/message`, { session_id: String(sent.session_id), content: 'Can I talk to a person?', contact_id: session.contact_id });
    clock += 600;
    const afterHandoff = await fetch(`${api}/messages?session_id=${sent.session_id}`).then((r) => r.json());
    expect(afterHandoff.waiting_for_team).toBe(true);

    // A reload finds the same conversation.
    const again = await post(`${api}/session/start`, { contact_id: session.contact_id });
    expect(again.session_id).toBe(String(sent.session_id));
    expect(again.messages).toHaveLength(4);
  });

  it('still hands over a reply written before the visitor\'s next message', async () => {
    let clock = 1_000_000;
    const api = await start(() => clock);
    const session = await post(`${api}/session/start`, {});
    const first = await post(`${api}/message`, { session_id: '0', content: 'How long does delivery take?', contact_id: session.contact_id });
    clock += 600;
    const second = await post(`${api}/message`, { session_id: String(first.session_id), content: 'What are your business hours?', contact_id: session.contact_id });
    clock += 600;
    // The widget asks for messages after its newest one: its own second message.
    const polled = await fetch(`${api}/messages?session_id=${first.session_id}&after_id=${second.message.id}`).then((r) => r.json());
    expect(polled.messages.map((m: { content: string }) => m.content)).toEqual([data.policies.delivery.summary, data.policies.hours.summary]);
    const again = await fetch(`${api}/messages?session_id=${first.session_id}&after_id=${second.message.id}`).then((r) => r.json());
    expect(again.messages).toHaveLength(1); // only the newest, by id; the early reply isn't sent twice
  });

  it('knows only its own widget token', async () => {
    const api = await start(() => Date.now());
    expect((await fetch(api.replace('wgt_demo', 'wgt_other') + '/config')).status).toBe(404);
  });
});
