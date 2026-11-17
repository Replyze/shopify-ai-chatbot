/**
 * A stand-in for the part of the Replyze API the widget talks to, so the
 * real widget.js runs locally without an account. It keeps everything in
 * memory and answers with demo/answers.ts. Only for the demo and the tests:
 * the production widget talks to client.replyze.chat.
 *
 * It follows what the widget expects (widget/src/services/api.ts in Replyze):
 * GET config, POST session/start, POST message, GET messages?after_id=,
 * plus no-op answers for read receipts, page views, data and events.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody, sendJson } from '../app/http.ts';
import { answerFor, type DemoCard, type DemoStore } from './answers.ts';

interface StoredMessage {
  id: string;
  content: string;
  sender: 'visitor' | 'bot';
  sender_name?: string;
  created_at: string;
  cards?: DemoCard[];
  ai: false;
  /** Bot replies appear after a short "typing" pause, like a real reply. */
  visibleAt: number;
}

interface Conversation {
  id: number;
  contactId: string;
  messages: StoredMessage[];
  waitingForTeam: boolean;
  /** Replies already handed to the widget. */
  delivered: Set<string>;
}

export interface FakeReplyzeOptions {
  token: string;
  data: DemoStore;
  /** Where product links and pictures point (the demo store). */
  baseUrl: string;
  replyDelayMs?: number;
  now?: () => number;
}

export const DEMO_BOT_NAME = 'Harbor & Pine demo';
export const DEMO_WELCOME =
  'Hi! This is a demo store, and my answers are scripted from sample data (no AI). Ask about shipping, returns, or a product.';
export const DEMO_STARTERS = ['What are your shipping options?', 'What is your return policy?', 'Do you have wireless earbuds?', 'Can I talk to a person?'];

export function createFakeReplyzeApi(options: FakeReplyzeOptions) {
  const now = options.now ?? (() => Date.now());
  const delay = options.replyDelayMs ?? 700;
  const conversations = new Map<number, Conversation>();
  let nextId = 1;
  let nextContact = 1;

  const widget = {
    color: '#1f5f4a',
    bot_name: DEMO_BOT_NAME,
    bot_avatar: null,
    position: 'right',
    theme: 'light',
    welcome_message: DEMO_WELCOME,
    show_greeting_teaser: false,
    pre_chat_form: false,
    auto_open_delay: null,
    starter_replies: DEMO_STARTERS,
    offline_form: 'never',
    identity_verification: false,
    voice_messages: false,
    show_branding: true,
    reply_time: null,
  };
  const features = { home_tab: false, help_tab: false, search: false };
  const teamStatus = { state: 'online', back_at: null };

  function credentials(contactId: string) {
    return { contact_id: contactId, visitor_key: `vk_demo_${contactId}`, channel_key: `ck_demo_${contactId}` };
  }

  /**
   * Messages newer than after_id, plus any reply not handed over yet. The
   * widget asks for messages after the newest id it has, which can be its
   * own second message; a reply written before that message would then be
   * skipped while there is no WebSocket (the demo has none). The widget
   * drops ids it already has, so sending a reply twice is harmless.
   */
  function visible(conversation: Conversation, afterId = 0) {
    const out = conversation.messages
      .filter((m) => m.visibleAt <= now() && (Number(m.id) > afterId || (m.sender === 'bot' && !conversation.delivered.has(m.id))))
      .map(({ visibleAt: _visibleAt, ...m }) => m);
    for (const m of out) if (m.sender === 'bot') conversation.delivered.add(m.id);
    return out;
  }

  async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
    const raw = await readBody(req, 100_000);
    try {
      const parsed = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Handles /api/w/<token>/...; returns false for any other path. */
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const match = /^\/api\/w\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (!match) return false;
    const [, token, rest] = match;
    if (token !== options.token) {
      sendJson(res, 404, { error: 'Widget not found' });
      return true;
    }
    const route = `${req.method} ${rest}`;

    switch (route) {
      case 'GET config':
        sendJson(res, 200, { widget, ws: null, features, team_status: teamStatus, team_avatars: [], help_center: null });
        return true;

      case 'POST session/start': {
        const body = await json(req);
        const contactId = typeof body.contact_id === 'string' && body.contact_id ? body.contact_id : String(nextContact++);
        const open = [...conversations.values()].reverse().find((c) => c.contactId === contactId);
        sendJson(res, 200, {
          session_id: open ? String(open.id) : '0',
          ...credentials(contactId),
          messages: open ? visible(open) : [],
          waiting_for_team: open?.waitingForTeam ?? false,
          widget,
          features,
          team_status: teamStatus,
          team_avatars: [],
          ws: null,
        });
        return true;
      }

      case 'POST message': {
        const body = await json(req);
        const content = typeof body.content === 'string' ? body.content.slice(0, 2000) : '';
        const contactId = typeof body.contact_id === 'string' && body.contact_id ? body.contact_id : String(nextContact++);
        let conversation = conversations.get(Number(body.session_id));
        if (!conversation) {
          conversation = { id: nextId++, contactId, messages: [], waitingForTeam: false, delivered: new Set() };
          conversations.set(conversation.id, conversation);
        }
        const at = now();
        const visitor: StoredMessage = { id: String(nextId++), content, sender: 'visitor', created_at: new Date(at).toISOString(), ai: false, visibleAt: at };
        conversation.messages.push(visitor);

        const reply = answerFor(content, options.data, options.baseUrl);
        const replyAt = at + delay;
        conversation.messages.push({
          id: String(nextId++),
          content: reply.content,
          sender: 'bot',
          sender_name: DEMO_BOT_NAME,
          created_at: new Date(replyAt).toISOString(),
          ...(reply.cards ? { cards: reply.cards } : {}),
          ai: false,
          visibleAt: replyAt,
        });
        if (reply.handoff) conversation.waitingForTeam = true;

        const { visibleAt: _v, ...message } = visitor;
        sendJson(res, 200, {
          message,
          ai_replying: true,
          session_id: conversation.id,
          ...credentials(conversation.contactId),
          contact_has_email: false,
          waiting_for_team: conversation.waitingForTeam,
        });
        return true;
      }

      case 'GET messages': {
        const conversation = conversations.get(Number(url.searchParams.get('session_id')));
        const afterId = Number(url.searchParams.get('after_id') ?? 0) || 0;
        sendJson(res, 200, conversation
          ? { messages: visible(conversation, afterId), waiting_for_team: conversation.waitingForTeam, team_status: teamStatus }
          : { messages: [] });
        return true;
      }

      case 'GET conversations':
        sendJson(res, 200, { conversations: [] });
        return true;

      case 'POST identify': {
        const body = await json(req);
        const contactId = typeof body.contact_id === 'string' && body.contact_id ? body.contact_id : String(nextContact++);
        sendJson(res, 200, { ...credentials(contactId), email: body.email ?? null, name: body.name ?? null, verified: false, switched: false, form_data: {} });
        return true;
      }

      case 'POST visit':
        await json(req);
        sendJson(res, 200, { visitor_id: 'demo-visitor' });
        return true;

      case 'POST messages/read':
      case 'POST typing':
      case 'POST state':
      case 'POST data':
      case 'POST events':
      case 'POST feedback':
      case 'POST rating':
        await json(req);
        sendJson(res, 200, { success: true });
        return true;

      default:
        sendJson(res, 404, { error: 'Not part of the demo' });
        return true;
    }
  };
}
