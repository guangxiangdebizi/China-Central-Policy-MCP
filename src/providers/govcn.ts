import { load } from 'cheerio';
import { canonical, checkWindow, clean, dateOf, docKey, hash, PolicyError, readCursor, saveCursor } from '../core.js';
import { govFetch, parseJson } from '../net/govFetch.js';
import { searchInput, searchData, type PolicyHit } from '../schemas.js';
import type * as z from 'zod/v4';

export const LATEST_URL = 'https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json';
const catalogs = ['gongwen', 'bumenfile', 'gongbao'];
type Row = Record<string, unknown>;
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const plain = (value: unknown) => clean(load(String(value ?? '')).text());
export function parseLatest(raw: unknown): PolicyHit[] {
  if (!Array.isArray(raw) || raw.some(r => !record(r) || typeof r.TITLE !== 'string' || typeof r.URL !== 'string' || typeof r.DOCRELPUBTIME !== 'string')) {
    throw new PolicyError('SOURCE_CHANGED', '最新政策栏目 JSON 结构已变更。');
  }
  return raw.map(r => ({ policy_id: canonical(r.URL), title: plain(r.TITLE), url: canonical(r.URL), issuer: null, doc_no: null,
    published_on: dateOf(r.DOCRELPUBTIME), snippet: '', catalog: 'latest', alternate_urls: [] })).sort((a, b) => (b.published_on ?? '').localeCompare(a.published_on ?? ''));
}
export function parseSearch(raw: unknown, selected: string[]) {
  if (!record(raw) || (raw.code !== undefined && ![0, 200, '0', '200'].includes(raw.code as string | number))) {
    throw new PolicyError('SOURCE_CHANGED', '检索接口业务码或返回结构异常。');
  }
  const vo = record(raw.searchVO) ? raw.searchVO : raw;
  const map = vo.catMap;
  if (!record(map)) throw new PolicyError('SOURCE_CHANGED', '检索接口缺少 searchVO.catMap。');
  const lists: PolicyHit[][] = [];
  const totals: Record<string, number> = {};
  for (const catalog of selected) {
    const cat = map[catalog];
    if (!record(cat) || !Array.isArray(cat.listVO) || !Number.isFinite(Number(cat.totalCount))) throw new PolicyError('SOURCE_CHANGED', `检索栏目 ${catalog} 结构异常。`);
    totals[catalog] = Number(cat.totalCount);
    lists.push(cat.listVO.map((r: unknown) => {
      if (!record(r) || typeof r.title !== 'string' || typeof r.url !== 'string') throw new PolicyError('SOURCE_CHANGED', '检索结果缺少题名或 URL。');
      return { policy_id: canonical(r.url), title: plain(r.title), url: canonical(r.url), issuer: plain(r.puborg) || null,
        doc_no: plain(r.pcode || r.pubnum || r.fwzh || r.wenhao) || null, published_on: dateOf(r.pubtimeStr) ?? dateOf(r.pubtime),
        snippet: plain(r.summary || r.content), catalog, alternate_urls: [] };
    }));
  }
  const items: PolicyHit[] = [];
  for (let rank = 0; rank < Math.max(0, ...lists.map(l => l.length)); rank++) {
    for (const list of lists) if (list[rank]) items.push(list[rank]);
  }
  return { items, totals };
}
export function mergeHits(items: PolicyHit[]) {
  const result: PolicyHit[] = [];
  const urls = new Map<string, PolicyHit>();
  const identities = new Map<string, PolicyHit>();
  for (const item of items) {
    const identity = item.doc_no && item.issuer ? `${docKey(item.doc_no)}|${clean(item.issuer)}|${item.title.replace(/\s/g, '')}` : null;
    const found = urls.get(item.url) ?? (identity ? identities.get(identity) : undefined);
    if (found) {
      if (found.url !== item.url && !found.alternate_urls.includes(item.url)) found.alternate_urls.push(item.url);
      urls.set(item.url, found);
      continue;
    }
    result.push(item);
    urls.set(item.url, item);
    if (identity) identities.set(identity, item);
  }
  return result;
}
type Input = z.infer<typeof searchInput>;
type State = { items: PolicyHit[]; offset: number; page: number; done: boolean; scanned: number; unknown: number;
  totals: Record<string, number>; days: string[]; historyLimited: boolean };
export async function searchPolicies(input: Input, deadline = Date.now() + 30_000): Promise<z.infer<typeof searchData>> {
  checkWindow(input.from, input.to);
  if (input.mode === 'doc_no' && !input.query) throw new PolicyError('INVALID_INPUT', '文号检索必须提供 query。');
  if (!input.query && input.catalog !== 'all') throw new PolicyError('INVALID_INPUT', '无关键词时仅支持 catalog=all。');
  const key = hash(JSON.stringify({ ...input, cursor: undefined, limit: undefined }));
  let state = input.cursor ? readCursor<State>(input.cursor, 'search', key) :
    { items: [], offset: 0, page: 0, done: false, scanned: 0, unknown: 0, totals: {}, days: [], historyLimited: false };
  const selected = input.catalog === 'all' ? catalogs : [input.catalog];
  const accept = (items: PolicyHit[]) => {
    state.scanned += items.length;
    for (const item of items) {
      if (!item.published_on) state.unknown++;
      else state.days.push(item.published_on);
      if ((input.from || input.to) && !item.published_on) continue;
      if (input.from && item.published_on! < input.from || input.to && item.published_on! > input.to) continue;
      if (input.mode === 'doc_no' && docKey(item.doc_no ?? '') !== docKey(input.query!)) continue;
      state.items.push(item);
    }
    state.items = mergeHits(state.items);
  };
  if (!input.query && !state.done) {
    const rows = parseLatest(parseJson((await govFetch.get(LATEST_URL, false, deadline)).text));
    accept(rows);
    state.page = 1;
    state.done = true;
    state.historyLimited = !!input.from && input.from < (state.days.slice().sort()[0] ?? '9999');
  } else if (input.query) {
    let budget = 3;
    while (state.items.length - state.offset < input.limit && !state.done && budget-- > 0) {
      const params = new URLSearchParams({ t: 'zhengcelibrary_gw_bm_gb', q: input.mode === 'doc_no' ? docKey(input.query) : input.query,
        searchfield: 'title:content:summary', sort: input.from || input.to ? 'pubtime' : 'score', sortType: '1', p: String(state.page + 1), n: '10', timetype: 'timezd' });
      // Filter published_on locally: upstream timezd can mean the issued date.
      const parsed = parseSearch(parseJson((await govFetch.get(`https://sousuo.www.gov.cn/search-gov/data?${params}`, false, deadline)).text), selected);
      state.page++;
      state.totals = parsed.totals;
      accept(parsed.items);
      state.done = selected.every(c => state.page * 10 >= parsed.totals[c]);
      if (state.page >= 30) state.done = true;
    }
  }
  const items = state.items.slice(state.offset, state.offset + input.limit);
  state.offset += items.length;
  const more = state.offset < state.items.length || !state.done;
  const truncated = more || state.historyLimited || state.unknown > 0 || (state.page >= 30 && selected.some(c => state.page * 10 < state.totals[c]));
  const notes = [input.query ? '按栏目原排名轮取；日期窗在北京时间发布日期上本地过滤；最多扫描 30 页，每次调用最多取 3 页。' : '仅代表官方最新栏目 JSON 的可见范围。'];
  if (state.historyLimited) notes.push('开始日期早于最新栏目最早可见日，历史覆盖不足。');
  if (state.unknown) notes.push(`${state.unknown} 条发布日期未知；有日期窗时已排除。`);
  if (more) notes.push('仍有未交付或未扫描项目，请保留参数并使用 next_cursor 续查。');
  if (state.page >= 30) notes.push('已达到 30 页扫描上限。');
  return { items, returned: items.length, source: input.query ? 'gov_cn_search_api' : 'gov_cn_latest_json', date_basis: 'published_on / Asia/Shanghai (UTC+08:00)',
    coverage: { catalogs: input.query ? selected : ['latest'], pages_scanned: state.page, upstream_totals: state.totals, scanned: state.scanned,
      unknown_dates: state.unknown, window_start: state.days.slice().sort()[0] ?? null, window_end: state.days.slice().sort().at(-1) ?? null, truncated, notes },
    next_cursor: more ? saveCursor('search', key, state) : null };
}
