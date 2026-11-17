/**
 * The part of the Replyze REST API v1 this project uses: knowledge base
 * articles (https://client.replyze.chat/api/v1/openapi.json). A workspace API
 * key with `knowledge:write` (which includes `knowledge:read`) is sent as a
 * Bearer token. Errors come back as { error: { code, message, details } }.
 */

export interface Article {
  object: 'article';
  id: number;
  title: string;
  slug: string;
  status: 'published' | 'draft';
  tags: string[];
  content?: string;
  updated_at?: string | null;
}

export interface ArticleInput {
  title?: string;
  content?: string;
  status?: 'published' | 'draft';
  slug?: string;
  tags?: string[];
  category_id?: number | null;
}

export class ReplyzeApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ReplyzeApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ReplyzeApiOptions {
  apiUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  /** Waits between retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

export class ReplyzeApi {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ReplyzeApiOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** The key, its scopes and its workspace: a connection test. */
  me(): Promise<{ scopes?: string[]; workspace?: { name?: string } }> {
    return this.request('GET', '/me');
  }

  /** Every article (without content), page by page. */
  async listArticles(): Promise<Article[]> {
    const all: Article[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const query: string = `/articles?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const body = await this.request<{ data: Article[]; has_more: boolean; next_cursor: string | null }>('GET', query);
      all.push(...body.data);
      if (!body.has_more || !body.next_cursor) return all;
      cursor = body.next_cursor;
    }
    throw new ReplyzeApiError('Too many pages of articles.', 500, 'too_many_pages');
  }

  getArticle(id: number): Promise<Article> {
    return this.request('GET', `/articles/${id}`);
  }

  createArticle(input: ArticleInput, idempotencyKey: string): Promise<Article> {
    return this.request('POST', '/articles', input, { 'Idempotency-Key': idempotencyKey });
  }

  updateArticle(id: number, input: ArticleInput): Promise<Article> {
    return this.request('PATCH', `/articles/${id}`, input);
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.apiUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        if (attempt < 2) {
          await this.sleep(1000 * (attempt + 1));
          continue;
        }
        throw new ReplyzeApiError('Could not reach the Replyze API.', 0, 'network_error');
      }

      // Rate limited or a passing server error: wait (Retry-After when given) and try again, twice at most.
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * (attempt + 1));
        continue;
      }

      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!response.ok) {
        const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
        throw new ReplyzeApiError(explain(response.status, error?.code, error?.message), response.status, error?.code ?? `http_${response.status}`);
      }
      return json as T;
    }
  }
}

function explain(status: number, code?: string, message?: string): string {
  if (status === 401) return `The Replyze API key was refused (${code ?? 'unauthorized'}). Make a new one in Settings → Integrations → Developer.`;
  if (status === 403 && code === 'insufficient_scope') return 'The Replyze API key needs the knowledge:write scope.';
  if (status === 403 && code === 'plan_required') return 'This Replyze workspace\'s plan does not include the REST API.';
  return message ? `Replyze API ${status}: ${message}` : `Replyze API answered ${status}.`;
}
