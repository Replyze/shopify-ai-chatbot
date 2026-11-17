/** Test helpers: a handler on a real local port, and signed Shopify requests. */
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHandler } from '../app/server.ts';
import type { Handler } from '../app/http.ts';
import { appProxyMessage } from '../app/services/shopifySignatures.ts';

export interface Running {
  url: string;
  close: () => Promise<void>;
}

/** Serves these routes on 127.0.0.1 with a free port. */
export async function serve(routes: Map<string, Handler>, log: (line: string) => void = () => undefined): Promise<Running> {
  const server: Server = createServer(createHandler(routes, log));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** An app proxy query string signed the way Shopify signs it. */
export function signedProxyQuery(params: Record<string, string>, secret: string): string {
  const search = new URLSearchParams(params);
  search.set('signature', createHmac('sha256', secret).update(appProxyMessage(search)).digest('hex'));
  return search.toString();
}

export function webhookHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}
