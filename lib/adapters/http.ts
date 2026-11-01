// HTTP helper for every scraper request (spec §4): 30 s timeout, descriptive
// User-Agent, up to 2 retries with backoff on 5xx / network errors, at least
// 500 ms between requests to the same host, UTF-8 decoding.

export const USER_AGENT = 'NeighborhoodHacks-AgendaBot/0.1 (student civic project)';
export const TIMEOUT_MS = 30_000;
export const MIN_HOST_SPACING_MS = 500;
export const MAX_RETRIES = 2;

export type HttpOptions = {
  headers?: Record<string, string>;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Override for tests (defaults to real setTimeout sleep). */
  sleep?: (ms: number) => Promise<void>;
  retries?: number;
  /** Per-request timeout (default 30 s). It also covers reading the body. */
  timeoutMs?: number;
  /** Send a URL-encoded POST with these fields instead of a GET (BoardDocs' list and print views). */
  form?: Record<string, string>;
};

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// host -> time (ms) when the next request to that host may start
const nextSlot = new Map<string, number>();

async function waitForHost(host: string, sleep: (ms: number) => Promise<void>): Promise<void> {
  const now = Date.now();
  const slot = nextSlot.get(host) ?? 0;
  const start = Math.max(now, slot);
  nextSlot.set(host, start + MIN_HOST_SPACING_MS);
  if (start > now) await sleep(start - now);
}

/** Test hook: forget per-host spacing state. */
export function resetHostSpacing(): void {
  nextSlot.clear();
}

/** Fetch with timeout, retry, UA and per-host spacing. Throws HttpError on a final non-2xx. */
export async function httpGet(url: string, opts: HttpOptions = {}): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  const retries = opts.retries ?? MAX_RETRIES;
  const host = new URL(url).host;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    await waitForHost(host, sleep);
    try {
      const res = await doFetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          ...(opts.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...opts.headers,
        },
        ...(opts.form ? { method: 'POST', body: new URLSearchParams(opts.form).toString() } : {}),
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
        redirect: 'follow',
      });
      if (res.ok) return res;
      lastErr = new HttpError(`${opts.form ? 'POST' : 'GET'} ${url} -> ${res.status}`, res.status, url);
      if (res.status < 500) throw lastErr; // 4xx: don't retry
    } catch (e) {
      if (e instanceof HttpError && e.status !== undefined && e.status < 500) throw e;
      lastErr = e;
    }
  }
  if (lastErr instanceof HttpError) throw lastErr;
  throw new HttpError(`GET ${url} failed: ${String((lastErr as Error)?.message ?? lastErr)}`, undefined, url);
}

/** GET and decode the body as UTF-8 text. */
export async function getText(url: string, opts?: HttpOptions): Promise<string> {
  const res = await httpGet(url, opts);
  const buf = await res.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

/** GET and parse JSON (decoded as UTF-8). */
export async function getJson<T = unknown>(url: string, opts?: HttpOptions): Promise<T> {
  return JSON.parse(await getText(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } })) as T;
}

/** Large PDFs (Lone Star agendas are ~8 MB) need longer than the 30 s default to download. */
export const PDF_TIMEOUT_MS = 120_000;

/** GET raw bytes (PDFs). */
export async function getBytes(url: string, opts?: HttpOptions): Promise<Uint8Array> {
  const res = await httpGet(url, opts);
  return new Uint8Array(await res.arrayBuffer());
}
