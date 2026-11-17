/**
 * The demo's scripted answers. Not AI: fixed rules over demo/data/store.json,
 * so the same question always gets the same answer (tests and screenshots
 * depend on it). With Replyze connected, the AI writes the answers instead,
 * from the knowledge base and the live product lookup.
 */
import { DemoProductSource, type DemoProduct } from '../app/services/products.ts';

export interface DemoStore {
  store: { name: string; tagline: string; email: string; currency: string };
  policies: Record<'shipping' | 'delivery' | 'returns' | 'contact' | 'hours', { title: string; summary: string; body: string }>;
  products: DemoProduct[];
}

/** A product card as the Replyze widget draws it under a reply. */
export interface DemoCard {
  title: string;
  description?: string;
  image_url?: string;
  url?: string;
  price?: string;
  in_stock?: boolean;
}

export interface DemoAnswer {
  intent: 'handoff' | 'greeting' | 'returns' | 'delivery' | 'shipping' | 'hours' | 'contact' | 'product' | 'browse' | 'fallback';
  content: string;
  cards?: DemoCard[];
  /** The shopper asked for a person: the chat now waits for the team. */
  handoff?: boolean;
}

const RULES: Array<[DemoAnswer['intent'], RegExp]> = [
  ['handoff', /\b(human|person|people|agent|someone|somebody|representative|real person|talk to|speak to|staff|operator)\b/i],
  ['returns', /\b(return|returns|refund|refunds|exchange|send (it )?back)\b/i],
  ['delivery', /\b(how long|delivery time|deliver(y|ed)? (take|takes)|arrive|arrival|when will|business days|tracking)\b/i],
  ['shipping', /\b(ship|shipping|shipment|postage|courier|express|free delivery|delivery (cost|options|price)|canada)\b/i],
  ['hours', /\b(hours|open|opening|closed|weekend|holiday|business hours|what time)\b/i],
  ['contact', /\b(contact|email|e-mail|phone|call|reach|support team|customer service)\b/i],
  ['browse', /\b(what do you (sell|have)|in stock\??$|bestsellers?|recommend|products|catalog|what('?s| is) available)\b/i],
];

const GREETING = /^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening))[\s!.,]*$/i;

export function answerFor(text: string, data: DemoStore, baseUrl: string): DemoAnswer {
  const source = new DemoProductSource(data.products, baseUrl);
  const card = (p: DemoProduct): DemoCard => {
    const summary = source.summary(p);
    return {
      title: summary.title,
      description: p.category,
      image_url: `${baseUrl.replace(/\/+$/, '')}/images/${p.handle}.svg`,
      url: summary.url,
      price: summary.price,
      in_stock: p.available,
    };
  };

  if (GREETING.test(text)) {
    return {
      intent: 'greeting',
      content: `Hi! I'm the ${data.store.name} demo assistant. My answers are scripted from sample data. Ask about shipping, delivery, returns, our hours, or a product.`,
    };
  }

  // A product named in the question wins over the general rules ("is the speaker waterproof?").
  const matches = source.match(text);
  const intent = RULES.find(([, pattern]) => pattern.test(text))?.[0];

  if (intent === 'handoff') {
    return {
      intent,
      handoff: true,
      content:
        'I\'ll pass this to the team. (In this demo nobody is on the other side. With Replyze connected, the chat goes to the store\'s shared inbox, the AI stops answering, and the shopper sees that a teammate is on the way.)',
    };
  }
  if (matches.length > 0 && (intent === undefined || intent === 'browse')) {
    const top = matches.slice(0, 3);
    const first = top[0]!;
    const price = source.summary(first).price;
    const lead = first.available
      ? `Yes, the ${first.title} is available for ${price}.`
      : `The ${first.title} (${price}) is sold out right now.`;
    const others = top.length > 1 ? ' Here are the closest matches.' : '';
    return { intent: 'product', content: `${lead}${others} (Demo prices and stock.)`, cards: top.map(card) };
  }
  if (intent === 'browse') {
    const available = data.products.filter((p) => p.available).slice(0, 3);
    return {
      intent,
      content: `We sell clothing, home goods and small electronics. A few that are available now: (Demo prices and stock.)`,
      cards: available.map(card),
    };
  }
  if (intent && intent in data.policies) {
    const policy = data.policies[intent as keyof DemoStore['policies']];
    return { intent, content: policy.summary };
  }
  return {
    intent: 'fallback',
    content:
      'I only know this demo store\'s sample data: shipping, delivery times, returns, contact, business hours and the products in the catalog. With Replyze connected, the AI answers from your own knowledge base and hands anything else to your team.',
  };
}
