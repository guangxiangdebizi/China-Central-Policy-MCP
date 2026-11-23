import { createHash, randomUUID } from 'node:crypto';

export class PolicyError extends Error {
  constructor(public code: string, message: string, public retryable = false,
    public hint = '请调整参数或稍后重试。') { super(message); }
}
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const clean = (text: string) => text.replace(/[\s\u00a0\u3000]+/g, ' ').trim();
export const docKey = (text: string) => text.replace(/\s/g, '').replace(/[［\[（(【]/g, '〔').replace(/[］\]）)】]/g, '〕');
export const hosts = new Set(['www.gov.cn', 'sousuo.www.gov.cn']);
export function canonical(input: string, base = 'https://www.gov.cn/'): string {
  let u: URL;
  try { u = new URL(input, base); } catch { throw new PolicyError('UNSUPPORTED_URL', '无效的政策 URL。'); }
  if (u.username || u.password || u.port || !['http:', 'https:'].includes(u.protocol)) {
    throw new PolicyError('UNSUPPORTED_URL', 'URL 必须使用标准 HTTPS 端口且不能包含凭据。');
  }
  u.protocol = 'https:';
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|from$|spm$)/.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.href;
}
export function allowed(input: string): string {
  const u = new URL(canonical(input));
  if (!hosts.has(u.hostname)) throw new PolicyError('UNSUPPORTED_URL', `不代抓取主机：${u.hostname}。`, false, '请使用中国政府网政策原件链接。');
  return u.href;
}
export function dateOf(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  const s = String(value);
  const match = s.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (match) {
    const day = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const parsed = new Date(day);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
  }
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s) * (s.length === 10 ? 1000 : 1);
    return new Date(n + 8 * 3600_000).toISOString().slice(0, 10);
  }
  return null;
}
export function checkWindow(from?: string, to?: string) {
  if (from && to && from > to) throw new PolicyError('INVALID_INPUT', 'from 不得晚于 to。');
}
export class Cache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  constructor(private ttl: number, private capacity = 256) {}
  get(key: string): T | undefined {
    const hit = this.values.get(key);
    if (!hit) return;
    this.values.delete(key);
    if (hit.expires <= Date.now()) return;
    this.values.set(key, hit);
    return hit.value;
  }
  set(key: string, value: T) {
    this.values.delete(key);
    this.values.set(key, { value, expires: Date.now() + this.ttl });
    if (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value!);
  }
}
const snapshots = new Cache<{ kind: string; key: string; value: unknown }>(600_000);
export function saveCursor(kind: string, key: string, value: unknown) {
  const token = randomUUID();
  snapshots.set(token, { kind, key, value });
  return token;
}
export function readCursor<T>(token: string, kind: string, key: string): T {
  const s = snapshots.get(token);
  if (!s || s.kind !== kind || s.key !== key) throw new PolicyError('CURSOR_EXPIRED', '游标已过期、正文版本已变更或查询参数不一致。', false, '移除 cursor 并重新查询；翻页时保留原参数。');
  return structuredClone(s.value) as T;
}
export const deadlineCheck = (deadline: number) => {
  if (Date.now() >= deadline) throw new PolicyError('UPSTREAM_TIMEOUT', '调用总时限已到。', true);
};
