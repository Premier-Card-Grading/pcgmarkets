export class PausedError extends Error {
  constructor(public status: number, url: string) { super(`Paused by ${status} from ${url}`); }
}

const lastCall = new Map<string, number>();
export function _resetForTests() { lastCall.clear(); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(url: string, init: RequestInit & { minIntervalMs?: number } = {}): Promise<Response> {
  const { minIntervalMs = 1000, ...rest } = init;
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());
  const headers = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})`, ...(rest.headers as Record<string, string> ?? {}) };
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, { ...rest, headers });
    } catch (e) {
      if (++attempt > 3) throw e;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status === 403) throw new PausedError(res.status, url);
    if (res.status >= 500 && ++attempt <= 3) { await sleep(500 * 2 ** attempt); continue; }
    return res;
  }
}
