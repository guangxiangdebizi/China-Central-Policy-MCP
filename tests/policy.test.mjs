import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GovFetcher } from '../build/net/govFetch.js';
import { dateOf, canonical, allowed, saveCursor, readCursor } from '../build/core.js';
import { parseSearch, parseLatest, mergeHits, LATEST_URL } from '../build/providers/govcn.js';
import { parsePolicy } from '../build/parsers/policy.js';
import { stdioClient, httpClient, call, employment, department } from './helpers.mjs';

test('北京时间、URL 限制、空列表与结构变化分开', () => {
  assert.equal(dateOf(1751994000), dateOf(1751994000000));
  assert.equal(dateOf(Date.parse('2025-07-08T18:00:00Z')), '2025-07-09');
  assert.equal(canonical('http://www.gov.cn/x.htm?utm_source=a#x'), 'https://www.gov.cn/x.htm');
  for (const url of ['https://127.0.0.1/x', 'https://www.gov.cn.evil.test/', 'https://www.gov.cn:8443/', 'file:///etc/passwd']) assert.throws(() => allowed(url));
  assert.deepEqual(parseSearch({ searchVO: { catMap: { gongwen: { totalCount: 0, listVO: [] } } } }, ['gongwen']).items, []);
  assert.throws(() => parseSearch({}, ['gongwen']), { code: 'SOURCE_CHANGED' });
  assert.throws(() => parseLatest({ rows: [] }), { code: 'SOURCE_CHANGED' });
  const cursor = saveCursor('body', 'old-body-hash', 2);
  assert.throws(() => readCursor(cursor, 'body', 'new-body-hash'), { code: 'CURSOR_EXPIRED' });
});

test('网络缓存合并请求、有限重试、超时、大小、重定向', async () => {
  let requests = 0;
  const net = new GovFetcher(async () => { requests++; return new Response('ok'); });
  await Promise.all([net.get(employment), net.get(employment)]);
  await net.get(employment);
  assert.equal(requests, 1);
  let attempts = 0;
  const retry = new GovFetcher(async () => ++attempts === 1 ? new Response('', { status: 503 }) : new Response('done'));
  assert.equal((await retry.get(employment)).text, 'done');
  assert.equal(attempts, 2);
  const timeout = new GovFetcher((_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))), 20);
  await assert.rejects(timeout.get(employment, false, Date.now() + 150), { code: 'UPSTREAM_TIMEOUT' });
  await assert.rejects(new GovFetcher(async () => new Response('123456'), 1000, 5).get(employment), { code: 'RESPONSE_TOO_LARGE' });
  await assert.rejects(new GovFetcher(async () => new Response('', { status: 302, headers: { location: 'https://127.0.0.1/' } })).get(employment), { code: 'UNSUPPORTED_URL' });
});

test('段落顺序、表头、解读图解与原文版本哈希', () => {
  const html = '<h1>测试政策</h1><div id="UCAP-CONTENT"><p>一、条件</p><p>须满足甲条件，期限至2025年12月底。</p><script>bad()</script><table><tr><th>类别</th><th>比例</th></tr><tr><td>小企业</td><td>90%</td></tr></table></div><div class="jiedu-blk"><a href="/zhengce/x.htm">政策解读</a><a href="/zhengce/y.htm">一图读懂</a></div>';
  const doc = parsePolicy(html, employment);
  assert.equal(doc.paragraphs[1].heading, '一、条件');
  assert.equal(doc.paragraphs.at(-1).text, '类别：小企业 | 比例：90%');
  assert.equal(doc.interpretations.length, 2);
  assert.equal(doc.interpretations[1].type, 'infographic');
  assert.notEqual(doc.document.body_hash, parsePolicy(html.replace('90%', '80%'), employment).document.body_hash);
  assert.throws(() => parsePolicy('<body>导航</body>', employment), { code: 'BODY_UNAVAILABLE' });
  const item = { policy_id: employment, url: employment, title: '通知', issuer: '国务院办公厅', doc_no: '国办发〔2025〕25号', published_on: '2025-07-09', snippet: '', catalog: 'gongwen', alternate_urls: [] };
  const merged = mergeHits([item, { ...item, url: 'https://www.gov.cn/gongbao/a.htm' }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].alternate_urls.length, 1);
});

test('真实 stdio MCP：栏目、关键词翻页、文号、全文、引用和简报文件', { timeout: 180000 }, async () => {
  const { client, stderr } = await stdioClient();
  try {
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(t => t.name).sort(), ['search_policies', 'get_policy_fulltext', 'get_policy_interpretations', 'policy_brief', 'build_policy_brief', 'get_latest_policies'].sort());
    assert.ok(tools.every(t => t.outputSchema));
    const latest = await call(client, 'search_policies', { limit: 3 });
    const raw = parseLatest(await (await fetch(LATEST_URL)).json());
    assert.deepEqual(latest.data.items.map(i => [i.title, i.url, i.published_on]), raw.slice(0, 3).map(i => [i.title, i.url, i.published_on]));
    assert.ok(latest.data.items.every(i => i.published_on && !i.url.endsWith('/')));
    const first = await call(client, 'search_policies', { query: '人工智能', limit: 20 });
    assert.ok(first.data.items.some(i => i.catalog === 'bumenfile'));
    const second = await call(client, 'search_policies', { query: '人工智能', limit: 20, cursor: first.data.next_cursor });
    assert.ok(second.data.items.length);
    assert.ok(second.data.coverage.pages_scanned >= 2);
    assert.equal(new Set([...first.data.items, ...second.data.items].map(i => i.url)).size, first.data.items.length + second.data.items.length);
    const docSearch = await call(client, 'search_policies', { query: '国办发[2025]25号', mode: 'doc_no', limit: 3 });
    assert.ok(docSearch.data.items.some(i => i.doc_no === '国办发〔2025〕25号'));
    const on23 = await call(client, 'search_policies', { query: '人工智能', from: '2026-10-23', to: '2026-10-23', limit: 5 });
    assert.ok(on23.data.items.some(i => i.doc_no === '国办发〔2026〕29号'));
    const on16 = await call(client, 'search_policies', { query: '人工智能', from: '2026-10-16', to: '2026-10-16', limit: 5 });
    assert.ok(!on16.data.items.some(i => i.doc_no === '国办发〔2026〕29号'));
    const full = (await call(client, 'get_policy_fulltext', { policy_id: employment, max_chars: 24000 })).data;
    assert.equal(full.document.issuer, '国务院办公厅');
    assert.equal(full.document.doc_no, '国办发〔2025〕25号');
    assert.equal(full.document.issued_on, '2025-07-03');
    assert.equal(full.document.published_on, '2025-07-09');
    assert.doesNotMatch(full.body, /function\s*\(|登录|font-size|margin-top/);
    assert.match(full.body, /（十九）强化宣传引导/);
    assert.match(full.body, /（本文有删减）/);
    const focus = (await call(client, 'get_policy_fulltext', { url: employment, focus: '稳岗返还' })).data;
    assert.ok(focus.paragraphs.some(p => p.text.includes('2025年12月底') && p.text.includes('90%')));
    for (const c of focus.citations) assert.equal(c.quote, full.paragraphs.find(p => p.id === c.paragraph_id).text);
    let cursor;
    const collected = [];
    do {
      const page = (await call(client, 'get_policy_fulltext', { url: employment, max_chars: 1000, ...(cursor ? { cursor } : {}) })).data;
      collected.push(...page.paragraphs);
      cursor = page.next_cursor;
    } while (cursor);
    assert.deepEqual(collected, full.paragraphs);
    const dept = (await call(client, 'get_policy_fulltext', { url: department })).data;
    assert.equal(dept.document.issuer, '工业和信息化部');
    assert.equal(dept.document.issued_on, '2026-09-02');
    assert.equal(dept.document.published_on, '2026-09-11');
    assert.ok(dept.attachments.some(a => a.url.endsWith('.pdf')));
    const interpretations = (await call(client, 'get_policy_interpretations', { url: employment })).data;
    assert.ok(Array.isArray(interpretations.items));
    if (!interpretations.items.length) assert.ok(interpretations.reason);
    for (const kind of ['weekly', 'classroom']) {
      const brief = (await call(client, 'policy_brief', { kind, policy_ids: [employment], focus: '稳岗返还' })).data;
      assert.equal(brief.coverage.read, 1);
      for (const c of brief.citations) assert.equal(c.quote, full.paragraphs.find(p => p.id === c.paragraph_id).text);
      for (const file of brief.files) {
        const bytes = await readFile(file.path);
        assert.equal(bytes.length, file.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
        if (file.format === 'json') assert.equal(JSON.parse(bytes).cards[0].document.doc_no, '国办发〔2025〕25号');
      }
    }
    const partial = await call(client, 'build_policy_brief', { kind: 'exam', policy_ids: [employment, 'https://www.gov.cn/'], focus: '稳岗返还' });
    assert.equal(partial.status, 'partial');
    assert.equal(partial.data.cards.length, 1);
    assert.equal(partial.data.coverage.failed.length, 1);
    const compare = await call(client, 'policy_brief', { kind: 'compare', policy_ids: [employment, department], focus: '稳岗返还' });
    assert.ok(compare.data.rows[0].left.length);
    assert.deepEqual(compare.data.rows[0].right, []);
    const legacy = await call(client, 'get_latest_policies', { limit: 25 });
    assert.equal(legacy.data.count, 25);
    assert.equal(legacy.data.items[0].date, latest.data.items[0].published_on);
    for (const [name, args, code] of [
      ['search_policies', { from: '2026-11-20', to: '2026-11-01' }, 'INVALID_INPUT'],
      ['search_policies', { query: '不同参数', cursor: first.data.next_cursor }, 'CURSOR_EXPIRED'],
      ['get_policy_fulltext', { url: 'https://example.com/x' }, 'UNSUPPORTED_URL'],
      ['policy_brief', { policy_ids: ['https://www.gov.cn/'] }, 'BODY_UNAVAILABLE'],
      ['search_policies', { from: '2026-02-30' }, 'INVALID_INPUT'],
      ['search_policies', { unknown: 'field' }, 'INVALID_INPUT'],
      ['get_policy_fulltext', { url: employment, policy_id: department }, 'INVALID_INPUT'],
      ['policy_brief', { query: '人工智能', policy_ids: [employment] }, 'INVALID_INPUT'],
    ]) {
      const error = await client.callTool({ name, arguments: args });
      assert.equal(error.isError, true);
      assert.equal(error.structuredContent.error.code, code);
    }
    assert.equal(stderr(), '');
  } finally { await client.close(); }
});

test('真实 HTTP MCP：列工具、正文一致、简报下载、路径边界', { timeout: 60000 }, async () => {
  const http = await httpClient();
  try {
    assert.equal((await http.client.listTools()).tools.length, 6);
    const full = (await call(http.client, 'get_policy_fulltext', { url: employment })).data;
    assert.equal(full.document.doc_no, '国办发〔2025〕25号');
    const brief = (await call(http.client, 'policy_brief', { policy_ids: [employment], focus: '稳岗返还' })).data;
    for (const file of brief.files) {
      assert.ok(file.downloadUrl.startsWith(http.base + '/files/'));
      const response = await fetch(file.downloadUrl);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
    assert.equal((await fetch(http.base + '/files/../package.json')).status, 404);
    assert.equal((await fetch(http.base + '/mcp', { headers: { Origin: 'https://evil.test' } })).status, 403);
  } finally { await http.close(); }
});
