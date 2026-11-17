/**
 * Replyze identity verification: `user_hash` is the hex HMAC-SHA256 of the
 * user's id (a string, trimmed), keyed with the widget's identity secret
 * (Settings → Chat Widget → Identity in Replyze). The widget sends it with
 * identify(), and Replyze makes the visitor that user's verified contact.
 *
 * The secret stays on this server. Anyone who has it can sign in as any of
 * your customers in the chat.
 */
import { createHmac } from 'node:crypto';

export function createUserHash(secret: string, userId: string | number): string {
  if (!secret) throw new Error('The Replyze identity secret is empty.');
  const id = String(userId).trim();
  if (!id) throw new Error('A user id is needed to sign.');
  return createHmac('sha256', secret).update(id).digest('hex');
}

/** The Replyze user id of a Shopify customer: Shopify's global id, the same on every store. */
export function shopifyCustomerUserId(customerId: string): string {
  if (!/^\d{1,20}$/.test(customerId)) throw new Error('A Shopify customer id is a number.');
  return `gid://shopify/Customer/${customerId}`;
}
