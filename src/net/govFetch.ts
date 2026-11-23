import { allowed, Cache, deadlineCheck, PolicyError } from '../core.js';

export type FetchResult = { text: string; url: string };
export class GovFetcher {
  private cache = new Cache<FetchResult>(600_000);
  private bodyCache = new Cache<FetchResult>(6 * 3600_000);
  private pending = new Map<string, Promise<FetchResult>>();
  private slots = new Map<string, { active: number; next: number }>();
  constructor(private request: typeof fetch = fetch, private timeout = 6000, private maxBytes = 4 * 1024 * 1024) {}
  async get(input: string, body = false, deadline = Date.now() + 30_000): Promise<FetchResult> {
    const url = allowed(input);
    const cache = body ? this.bodyCache : this.cache;
    const key = `${body}:${url}`;
    deadlineCheck(deadline);
    const hit = cache.get(key);
    if (hit) return hit;
    const shared = this.pending.get(key);
    if (shared) return this.withDeadline(shared, deadline);
    const task = this.perform(url, deadline).then(value => { cache.set(key, value); return value; });
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
  private async withDeadline(task: Promise<FetchResult>, deadline: number) {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([task, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PolicyError('UPSTREAM_TIMEOUT', '等待同键请求超时。', true)), Math.max(1, deadline - Date.now()));
      })]);
    } finally { clearTimeout(timer!); }
  }
  private async slot(host: string, deadline: number) {
    const state = this.slots.get(host) ?? { active: 0, next: 0 };
    this.slots.set(host, state);
    while (state.active >= 2 || state.next > Date.now()) {
      deadlineCheck(deadline);
      await new Promise(r => setTimeout(r, Math.min(100, Math.max(1, deadline - Date.now()))));
    }
    deadlineCheck(deadline);
    state.active++;
    state.next = Date.now() + 500;
    return () => { state.active--; };
  }
  private async perform(input: string, deadline: number): Promise<FetchResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let delay = 300;
      try {
        let url = input;
        for (let redirects = 0; redirects <= 4; redirects++) {
          allowed(url);
          const release = await this.slot(new URL(url).hostname, deadline);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(this.timeout, deadline - Date.now())));
          try {
            const response = await this.request(url, {
              redirect: 'manual', signal: controller.signal,
              headers: { 'User-Agent': 'Mozilla/5.0 China-Central-Policy-MCP/2.0', Accept: 'application/json,text/html;q=0.9,*/*;q=0.8' },
            });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              const location = response.headers.get('location');
              await response.body?.cancel();
              if (!location || redirects === 4) throw new PolicyError('SOURCE_CHANGED', '上游重定向过多或缺少目标。');
              const next = new URL(location, url);
              if (next.protocol !== 'https:') throw new PolicyError('UNSUPPORTED_URL', '拒绝非 HTTPS 重定向。');
              url = allowed(next.href);
              continue;
            }
            if (!response.ok) {
              await response.body?.cancel();
              const retryAfter = response.headers.get('retry-after');
              if (retryAfter) delay = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
              throw new PolicyError(response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_HTTP', `官方站点 HTTP ${response.status}。`, response.status === 429 || response.status >= 500);
            }
            if (Number(response.headers.get('content-length')) > this.maxBytes) {
              await response.body?.cancel();
              throw new PolicyError('RESPONSE_TOO_LARGE', '响应超过 4 MiB。');
            }
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            if (!response.body) throw new PolicyError('SOURCE_CHANGED', '官方站点返回空响应。');
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > this.maxBytes) { await reader.cancel(); throw new PolicyError('RESPONSE_TOO_LARGE', '响应超过 4 MiB。'); }
              chunks.push(value);
            }
            const buffer = Buffer.concat(chunks);
            const encoding = response.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1] ?? 'utf-8';
            return { text: new TextDecoder(encoding).decode(buffer), url };
          } finally { clearTimeout(timer); release(); }
        }
      } catch (err) {
        const error = err instanceof PolicyError ? err : new PolicyError(
          err instanceof Error && /abort|timeout/i.test(err.name + err.message) ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK',
          err instanceof Error ? err.message : String(err), true);
        if (!error.retryable || attempt === 1 || Date.now() + delay >= deadline) throw error;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new PolicyError('UPSTREAM_TIMEOUT', '请求未完成。', true);
  }
}
export const govFetch = new GovFetcher();
export function parseJson(text: string): unknown {
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new PolicyError('SOURCE_CHANGED', '官方接口未返回有效 JSON。'); }
}
